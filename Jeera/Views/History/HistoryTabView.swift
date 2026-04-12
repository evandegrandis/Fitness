import SwiftUI
import SwiftData

struct HistoryTabView: View {
    @Query(
        filter: #Predicate<WorkoutSession> { !$0.isActive },
        sort: \WorkoutSession.startTime,
        order: .reverse
    ) private var sessions: [WorkoutSession]

    @Query private var goals: [MuscleGoal]

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
                        LazyVStack(spacing: 18) {
                            ForEach(weeklyGroups, id: \.weekStart) { group in
                                WeeklyHistorySection(
                                    weekStart: group.weekStart,
                                    sessions: group.sessions,
                                    goals: goals
                                )
                            }
                        }
                        .padding(.horizontal)
                        .padding(.top, 12)
                        .padding(.bottom, 80)
                    }
                }
            }
            .navigationTitle("Historique")
            .navigationBarTitleDisplayMode(.inline)
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

// MARK: - Weekly Section

struct WeeklyHistorySection: View {
    let weekStart: Date
    let sessions: [WorkoutSession]
    let goals: [MuscleGoal]

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
        VStack(alignment: .leading, spacing: 8) {
            HStack(alignment: .firstTextBaseline) {
                Text(weekLabel)
                    .font(.subheadline.weight(.semibold))
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

            VStack(spacing: 10) {
                ForEach(sessions) { session in
                    NavigationLink {
                        WorkoutDetailView(session: session)
                    } label: {
                        HistoryRow(session: session)
                    }
                    .buttonStyle(.plain)
                }
            }
        }
    }
}

// MARK: - Row

struct HistoryRow: View {
    let session: WorkoutSession

    private var exerciseNames: String {
        let names = session.orderedExercises.compactMap { $0.exercise?.name }
        if names.count <= 3 {
            return names.joined(separator: ", ")
        }
        return names.prefix(3).joined(separator: ", ") + " +\(names.count - 3)"
    }

    var body: some View {
        GlassCard(padding: 14, cornerRadius: 22) {
            VStack(alignment: .leading, spacing: 6) {
                HStack {
                    Text(session.date.relativeDay)
                        .font(.subheadline.weight(.semibold))
                    Spacer()
                    Text(session.date.shortTime)
                        .font(.caption2)
                        .foregroundStyle(.tertiary)
                }

                HStack(spacing: 10) {
                    Label("\(session.totalWorkSets) sets", systemImage: "checkmark.circle")
                    Label(session.durationFormatted, systemImage: "clock")
                    Label("\(session.orderedExercises.count) exos", systemImage: "dumbbell")
                }
                .font(.caption2)
                .foregroundStyle(.secondary)

                Text(exerciseNames)
                    .font(.caption2)
                    .foregroundStyle(.tertiary)
                    .lineLimit(1)
            }
        }
    }
}
