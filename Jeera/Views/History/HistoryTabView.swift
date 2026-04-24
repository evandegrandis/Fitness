import SwiftUI
import SwiftData

struct HistoryTabView: View {
    @Environment(\.modelContext) private var modelContext
    @Query(
        filter: #Predicate<WorkoutSession> { !$0.isActive },
        sort: \WorkoutSession.startTime,
        order: .reverse
    ) private var sessions: [WorkoutSession]

    @Query private var goals: [MuscleGoal]
    @State private var sessionToDelete: WorkoutSession?
    @State private var highlightedSessionID: UUID?

    /// Sessions grouped into ISO weeks (Mon-Sun Europe/Paris). The dictionary key
    /// is the Monday of that week; groups are sorted newest-first.
    private var weeklyGroups: [(weekStart: Date, sessions: [WorkoutSession])] {
        let buckets = Dictionary(grouping: sessions) { $0.date.startOfWeek }
        return buckets
            .map { (weekStart: $0.key, sessions: $0.value) }
            .sorted { $0.weekStart > $1.weekStart }
    }

    var body: some View {
        NavigationStack {
            ZStack {
                BackgroundGradient()

                if sessions.isEmpty {
                    emptyState
                } else {
                    ScrollView {
                        LazyVStack(spacing: 14) {
                            HistoryOverviewCard(sessions: sessions)
                                .scrollTransition(.animated(.smooth(duration: 0.35, extraBounce: 0.06))) { content, phase in
                                    content
                                        .scaleEffect(phase.isIdentity ? 1 : 0.97)
                                        .opacity(phase.isIdentity ? 1 : 0.8)
                                }

                            ForEach(weeklyGroups, id: \.weekStart) { group in
                                WeeklyHistorySection(
                                    weekStart: group.weekStart,
                                    sessions: group.sessions,
                                    allSessions: sessions,
                                    goals: goals,
                                    highlightedSessionID: $highlightedSessionID,
                                    onDeleteSession: { sessionToDelete = $0 }
                                )
                            }
                        }
                        .padding(.horizontal)
                        .padding(.top, 10)
                        .padding(.bottom, 80)
                    }
                }
            }
            .navigationTitle("Historique")
            .navigationBarTitleDisplayMode(.inline)
            .alert("Supprimer cette séance ?", isPresented: Binding(
                get: { sessionToDelete != nil },
                set: { if !$0 { sessionToDelete = nil } }
            )) {
                Button("Supprimer", role: .destructive) {
                    if let sessionToDelete {
                        modelContext.delete(sessionToDelete)
                        try? modelContext.save()
                    }
                    sessionToDelete = nil
                }
                Button("Annuler", role: .cancel) {
                    sessionToDelete = nil
                }
            } message: {
                if let sessionToDelete {
                    Text("\(sessionToDelete.date.relativeDay) · \(sessionToDelete.totalWorkSets) sets")
                }
            }
        }
    }

    private var emptyState: some View {
        VStack(spacing: 12) {
            Image(systemName: "clock.arrow.circlepath")
                .font(.largeTitle)
                .foregroundStyle(.tertiary)
            Text("Pas encore de séance")
                .font(.subheadline)
                .foregroundStyle(.secondary)
            Text("Tes séances terminées apparaîtront ici.")
                .font(.caption)
                .foregroundStyle(.tertiary)
        }
    }
}

private struct HistoryOverviewCard: View {
    let sessions: [WorkoutSession]

    private var totalSets: Int { sessions.prefix(8).reduce(0) { $0 + $1.totalWorkSets } }
    private var totalPRs: Int {
        sessions.prefix(8).reduce(0) { $0 + recordCount(in: $1) }
    }
    private var totalHours: Int {
        Int(sessions.prefix(8).reduce(0.0) { $0 + ($1.duration ?? 0) } / 3600.0)
    }

    var body: some View {
        GlassCard(padding: 12, cornerRadius: 20) {
            HStack(spacing: 8) {
                metric("Séances", value: "\(min(sessions.count, 8))")
                metric("Sets", value: "\(totalSets)")
                metric("PR", value: "\(totalPRs)")
                metric("Heures", value: "\(totalHours)h")
            }
        }
    }

    private func metric(_ title: String, value: String) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(title.uppercased())
                .font(.system(size: 9, weight: .bold, design: .rounded))
                .foregroundStyle(.secondary)
            Text(value)
                .font(.subheadline.weight(.bold))
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.horizontal, 10)
        .padding(.vertical, 8)
        .background(Color.white.opacity(0.045), in: RoundedRectangle(cornerRadius: 14, style: .continuous))
    }

    private func recordCount(in session: WorkoutSession) -> Int {
        var count = 0

        for logged in session.loggedExercises {
            guard let exercise = logged.exercise else { continue }
            let allSets = sessions
                .filter { $0.date <= session.date }
                .flatMap { currentSession in
                    currentSession.loggedExercises.filter { $0.exercise?.id == exercise.id }
                }
                .flatMap(\.completedWorkSets)

            for set in logged.completedWorkSets where RecordsEngine.isRecordSet(set, among: allSets, exercise: exercise) {
                count += 1
            }
        }

        return count
    }
}

// MARK: - Weekly Section

struct WeeklyHistorySection: View {
    let weekStart: Date
    let sessions: [WorkoutSession]
    var allSessions: [WorkoutSession] = []
    let goals: [MuscleGoal]
    @Binding var highlightedSessionID: UUID?
    var onDeleteSession: (WorkoutSession) -> Void = { _ in }

    private var weekLabel: String {
        if Calendar.current.isDate(weekStart, equalTo: Date(), toGranularity: .weekOfYear) {
            return "Cette semaine"
        }
        let weekEnd = Calendar.current.date(byAdding: .day, value: 6, to: weekStart) ?? weekStart
        let formatter = DateFormatter()
        formatter.dateFormat = "d MMM"
        formatter.locale = Locale(identifier: "fr_FR")
        return "\(formatter.string(from: weekStart)) – \(formatter.string(from: weekEnd))"
    }

    /// Coverage % and groups worked for this calendar week.
    private var coveragePct: Int {
        Int((EffectiveSetsEngine.coverageForWeek(
            sessions: sessions,
            goals: goals,
            weekStart: weekStart
        ) * 100).rounded())
    }

    private var parentsWorked: Int {
        EffectiveSetsEngine.parentsWorkedInWeek(sessions: sessions, weekStart: weekStart)
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack(alignment: .firstTextBaseline) {
                Text(weekLabel)
                    .font(.system(size: 15, weight: .bold, design: .rounded))
                    .foregroundStyle(.primary)
                Spacer()
                let pct = coveragePct
                let groups = parentsWorked
                if pct > 0 || groups > 0 {
                    Text("Couverture \(pct)% · \(groups) groupes")
                        .font(.caption2.weight(.medium))
                        .foregroundStyle(pct >= 80 ? .green : .secondary)
                }
            }
            .padding(.horizontal, 4)

            VStack(spacing: 8) {
                ForEach(sessions) { session in
                    NavigationLink {
                        WorkoutDetailView(session: session)
                    } label: {
                        HistoryRow(
                            session: session,
                            allSessions: allSessions,
                            isHighlighted: highlightedSessionID == session.id
                        )
                    }
                    .buttonStyle(.plain)
                    .contextMenu {
                        Button(role: .destructive) {
                            highlightedSessionID = session.id
                            onDeleteSession(session)
                        } label: {
                            Label("Supprimer la séance", systemImage: "trash")
                        }
                    }
                    .scrollTransition(.animated(.smooth(duration: 0.28, extraBounce: 0.04))) { content, phase in
                        content
                            .offset(y: phase.isIdentity ? 0 : 16)
                            .opacity(phase.isIdentity ? 1 : 0.75)
                    }
                }
            }
        }
    }
}

// MARK: - Row

struct HistoryRow: View {
    let session: WorkoutSession
    /// All finished sessions, needed to detect which sets were records at the time.
    var allSessions: [WorkoutSession] = []
    var isHighlighted = false

    private var exerciseNames: String {
        let names = session.orderedExercises.compactMap { $0.exercise?.name }
        if names.count <= 3 {
            return names.joined(separator: ", ")
        }
        return names.prefix(3).joined(separator: ", ") + " +\(names.count - 3)"
    }

    /// Count how many record sets this session contains.
    private var recordCount: Int {
        guard !allSessions.isEmpty else { return 0 }
        var count = 0
        for logged in session.loggedExercises {
            guard let exercise = logged.exercise else { continue }
            // Gather all historical sets for this exercise up to and including this session.
            let allSets = allSessions
                .filter { $0.date <= session.date }
                .flatMap { s in s.loggedExercises.filter { $0.exercise?.id == exercise.id } }
                .flatMap(\.completedWorkSets)
            for set in logged.completedWorkSets {
                if RecordsEngine.isRecordSet(set, among: allSets, exercise: exercise) {
                    count += 1
                }
            }
        }
        return count
    }

    var body: some View {
        GlassCard(padding: 11, cornerRadius: 18) {
            VStack(alignment: .leading, spacing: 7) {
                HStack(alignment: .firstTextBaseline, spacing: 10) {
                    VStack(alignment: .leading, spacing: 5) {
                        Text(session.date.relativeDay)
                            .font(.system(size: 16, weight: .bold, design: .rounded))
                        Text(session.date.shortTime)
                            .font(.caption2.weight(.medium))
                            .foregroundStyle(.tertiary)
                    }
                    Spacer()
                    if recordCount > 0 {
                        Label(recordCount > 1 ? "PR ×\(recordCount)" : "PR", systemImage: "star.fill")
                            .font(.caption2.weight(.bold))
                            .foregroundStyle(.yellow)
                            .padding(.horizontal, 8)
                            .padding(.vertical, 5)
                            .background(.yellow.opacity(0.10), in: Capsule())
                    }
                }

                HStack(spacing: 10) {
                    Label("\(session.totalWorkSets) sets", systemImage: "checkmark.circle")
                    Label(session.durationFormatted, systemImage: "clock")
                    Label("\(session.orderedExercises.count) exos", systemImage: "dumbbell")
                }
                .font(.system(size: 10, weight: .medium, design: .rounded))
                .foregroundStyle(.secondary)

                Text(exerciseNames)
                    .font(.caption2)
                    .foregroundStyle(.secondary)
                    .lineLimit(1)
            }
        }
        .overlay {
            RoundedRectangle(cornerRadius: 20, style: .continuous)
                .stroke(isHighlighted ? .red.opacity(0.45) : .clear, lineWidth: 1.2)
        }
        .animation(.spring(response: 0.32, dampingFraction: 0.82), value: isHighlighted)
    }
}
