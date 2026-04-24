import SwiftUI
import SwiftData

struct QuickStartView: View {
    @Bindable var viewModel: WorkoutViewModel
    @Query(
        filter: #Predicate<WorkoutSession> { !$0.isActive },
        sort: \WorkoutSession.startTime,
        order: .reverse
    ) private var recentSessions: [WorkoutSession]
    @Query(sort: \WorkoutTemplate.sortOrder) private var templates: [WorkoutTemplate]
    @Query private var goals: [MuscleGoal]

    @State private var showNewTemplate = false
    @State private var newTemplateName = ""
    @State private var templateToRename: WorkoutTemplate?
    @State private var renameText = ""
    @State private var templateToDelete: WorkoutTemplate?
    @Namespace private var modeNamespace

    private var muscleGaps: [(MuscleParent, Double)] {
        EffectiveSetsEngine.rollingPriorities(sessions: recentSessions, goals: goals)
    }

    private var recommendedTemplate: WorkoutTemplate? {
        guard !muscleGaps.isEmpty else { return templates.first }
        let topGapParents = Set(muscleGaps.prefix(5).map(\.0))

        return templates.max(by: { a, b in
            templateGapScore(a, gaps: topGapParents) < templateGapScore(b, gaps: topGapParents)
        })
    }

    private func templateGapScore(_ template: WorkoutTemplate, gaps: Set<MuscleParent>) -> Int {
        template.templateExercises.reduce(0) { score, te in
            guard let ex = te.exercise else { return score }
            let parents = Set(ex.muscleMappings.filter { $0.coefficient >= 0.3 }.map { $0.muscleGroup.parent })
            return score + parents.intersection(gaps).count
        }
    }

    var body: some View {
        ScrollView {
            VStack(spacing: 14) {
                WeeklyPrioritySection()
                    .padding(.top, 10)

                VStack(spacing: 8) {
                    modePickerRow

                    if let recommended = recommendedTemplate {
                        QuickStartButton(
                            title: recommended.name,
                            subtitle: startSubtitle(for: recommended),
                            icon: "star.circle.fill",
                            color: .orange
                        ) {
                            viewModel.startFromTemplate(recommended, mode: viewModel.selectedStartMode)
                        }
                    }

                    if !recentSessions.isEmpty {
                        QuickStartButton(
                            title: "Répéter la dernière",
                            subtitle: lastWorkoutSubtitle,
                            icon: "arrow.counterclockwise.circle.fill",
                            color: .blue
                        ) {
                            viewModel.repeatLastWorkout(mode: viewModel.selectedStartMode)
                        }
                    }
                }
                .padding(.horizontal)
                .scrollTransition(.animated(.smooth(duration: 0.34, extraBounce: 0.05))) { content, phase in
                    content
                        .offset(y: phase.isIdentity ? 0 : 18)
                        .opacity(phase.isIdentity ? 1 : 0.75)
                }

                // Templates
                VStack(alignment: .leading, spacing: 6) {
                    HStack {
                        Text("Templates")
                            .font(.caption.weight(.semibold))
                            .foregroundStyle(.secondary)
                        Spacer()
                        Button {
                            newTemplateName = ""
                            showNewTemplate = true
                        } label: {
                            Image(systemName: "plus.circle")
                                .font(.subheadline)
                                .foregroundStyle(Color.accentColor)
                        }
                    }
                    .padding(.horizontal)

                    if templates.isEmpty {
                        Text("Aucun template")
                            .font(.caption)
                            .foregroundStyle(.tertiary)
                            .padding(.horizontal)
                    }

                    ForEach(templates) { template in
                        TemplateRow(template: template) {
                            viewModel.startFromTemplate(template, mode: viewModel.selectedStartMode)
                        }
                        .contextMenu {
                            Button {
                                renameText = template.name
                                templateToRename = template
                            } label: {
                                Label("Renommer", systemImage: "pencil")
                            }
                            Button {
                                duplicateTemplate(template)
                            } label: {
                                Label("Dupliquer", systemImage: "doc.on.doc")
                            }
                            Button(role: .destructive) {
                                templateToDelete = template
                            } label: {
                                Label("Supprimer", systemImage: "trash")
                            }
                        }
                        .padding(.horizontal)
                        .scrollTransition(.animated(.smooth(duration: 0.32, extraBounce: 0.02))) { content, phase in
                            content
                                .offset(x: phase.isIdentity ? 0 : -18)
                                .opacity(phase.isIdentity ? 1 : 0.68)
                        }
                    }
                }

                // Recent Achievements (records)
                AchievementsSection(sessions: recentSessions)
                    .scrollTransition(.animated(.smooth(duration: 0.4, extraBounce: 0.04))) { content, phase in
                        content
                            .offset(y: phase.isIdentity ? 0 : 20)
                            .opacity(phase.isIdentity ? 1 : 0.72)
                    }

                Spacer(minLength: 48)
            }
        }
        .alert("Nouveau template", isPresented: $showNewTemplate) {
            TextField("Nom", text: $newTemplateName)
            Button("Créer") {
                createEmptyTemplate(name: newTemplateName)
            }
            Button("Annuler", role: .cancel) {}
        }
        .alert("Renommer", isPresented: Binding(
            get: { templateToRename != nil },
            set: { if !$0 { templateToRename = nil } }
        )) {
            TextField("Nom", text: $renameText)
            Button("OK") {
                templateToRename?.name = renameText
                try? viewModel.modelContext?.save()
                templateToRename = nil
            }
            Button("Annuler", role: .cancel) { templateToRename = nil }
        }
        .alert("Supprimer ce template ?", isPresented: Binding(
            get: { templateToDelete != nil },
            set: { if !$0 { templateToDelete = nil } }
        )) {
            Button("Supprimer", role: .destructive) {
                if let t = templateToDelete {
                    viewModel.modelContext?.delete(t)
                    try? viewModel.modelContext?.save()
                }
                templateToDelete = nil
            }
            Button("Annuler", role: .cancel) { templateToDelete = nil }
        }
    }

    // MARK: - Template CRUD

    private func createEmptyTemplate(name: String) {
        guard let context = viewModel.modelContext, !name.isEmpty else { return }
        let template = WorkoutTemplate(name: name)
        context.insert(template)
        try? context.save()
    }

    private func duplicateTemplate(_ template: WorkoutTemplate) {
        guard let context = viewModel.modelContext else { return }
        let copy = WorkoutTemplate(name: "\(template.name) (copie)")
        context.insert(copy)
        for te in template.orderedExercises {
            let newTE = TemplateExercise(orderIndex: te.orderIndex, exercise: te.exercise, targetSets: te.targetSets)
            context.insert(newTE)
            copy.templateExercises.append(newTE)
        }
        try? context.save()
    }

    private var lastWorkoutSubtitle: String {
        guard let last = recentSessions.first else { return "" }
        let exercises = last.orderedExercises.compactMap { $0.exercise?.name }
        let preview = exercises.prefix(2).joined(separator: ", ")
        let more = exercises.count > 2 ? " +\(exercises.count - 2)" : ""
        return "\(last.date.relativeDay) — \(preview)\(more)"
    }

    private func startSubtitle(for template: WorkoutTemplate) -> String {
        switch viewModel.selectedStartMode {
        case .normal:
            return "Base"
        case .beast:
            return "Beast"
        case .monk:
            return "Monk"
        }
    }

    private var modePickerRow: some View {
        HStack(spacing: 8) {
            ForEach(WorkoutViewModel.WorkoutMode.allCases) { mode in
                ModeSelectorCard(
                    mode: mode,
                    isSelected: viewModel.selectedStartMode == mode,
                    namespace: modeNamespace
                ) {
                    withAnimation(.spring(response: 0.34, dampingFraction: 0.88)) {
                        viewModel.selectedStartMode = mode
                    }
                }
            }
        }
        .padding(5)
        .background(Color.white.opacity(0.04), in: RoundedRectangle(cornerRadius: 20, style: .continuous))
        .overlay {
            RoundedRectangle(cornerRadius: 20, style: .continuous)
                .stroke(.white.opacity(0.06), lineWidth: 1)
        }
        .padding(.bottom, 2)
    }
}

// MARK: - Workout Detail View (History)

struct WorkoutDetailView: View {
    let session: WorkoutSession
    @Query(
        filter: #Predicate<WorkoutSession> { !$0.isActive },
        sort: \WorkoutSession.startTime,
        order: .reverse
    ) private var allSessions: [WorkoutSession]

    var body: some View {
        ScrollView {
            VStack(spacing: 14) {
                // Session info
                HStack {
                    VStack(alignment: .leading, spacing: 4) {
                        Text(session.date.relativeDay)
                            .font(.title3.weight(.bold))
                        HStack(spacing: 12) {
                            Label(session.durationFormatted, systemImage: "clock")
                            Label("\(session.totalWorkSets) sets", systemImage: "checkmark.circle")
                        }
                        .font(.caption)
                        .foregroundStyle(.secondary)
                    }
                    Spacer()
                }
                .padding(.horizontal)

                // Exercises
                ForEach(session.orderedExercises) { loggedExercise in
                    HistoryExerciseCard(
                        loggedExercise: loggedExercise,
                        allSessions: allSessions,
                        sessionDate: session.date
                    )
                    .padding(.horizontal)
                }

                Spacer(minLength: 40)
            }
            .padding(.top, 8)
        }
        .background { BackgroundGradient() }
        .navigationBarTitleDisplayMode(.inline)
    }
}

struct HistoryExerciseCard: View {
    let loggedExercise: LoggedExercise
    var allSessions: [WorkoutSession] = []
    var sessionDate: Date = Date()

    /// All historical sets for this exercise up to and including this session.
    private var allHistoricalSets: [LoggedSet] {
        guard let exercise = loggedExercise.exercise else { return [] }
        return allSessions
            .filter { $0.date <= sessionDate }
            .flatMap { s in s.loggedExercises.filter { $0.exercise?.id == exercise.id } }
            .flatMap(\.completedWorkSets)
    }

    private func isRecord(_ set: LoggedSet) -> Bool {
        guard let exercise = loggedExercise.exercise else { return false }
        return RecordsEngine.isRecordSet(set, among: allHistoricalSets, exercise: exercise)
    }

    var body: some View {
        GlassCard(padding: 14, cornerRadius: 16) {
            VStack(alignment: .leading, spacing: 6) {
                HStack {
                    Text(loggedExercise.exercise?.name ?? "Unknown")
                        .font(.subheadline.weight(.semibold))
                    Spacer()
                    Text("\(loggedExercise.completedWorkSets.count) sets")
                        .font(.caption2)
                        .foregroundStyle(.secondary)
                }

                ForEach(loggedExercise.orderedSets) { set in
                    HStack(spacing: 6) {
                        Text("#\(set.setSlotIndex + 1)")
                            .font(.caption2.monospacedDigit())
                            .foregroundStyle(.tertiary)
                            .frame(width: 18, alignment: .leading)

                        if set.weight > 0 {
                            Text("\(set.weight.cleanWeight) x \(set.reps)")
                                .font(.caption.weight(.medium).monospacedDigit())
                        } else {
                            Text("BW x \(set.reps)")
                                .font(.caption.weight(.medium).monospacedDigit())
                        }

                        if set.setType != .work {
                            Text(set.setType.shortLabel)
                                .font(.system(size: 9).weight(.bold))
                                .foregroundStyle(set.setType == .topSet ? .orange : .blue)
                        }

                        if isRecord(set) {
                            Image(systemName: "star.fill")
                                .font(.system(size: 9))
                                .foregroundStyle(.yellow)
                        }

                        Spacer()
                    }
                }
            }
        }
    }
}

// MARK: - Supporting Views

struct QuickStartButton: View {
    let title: String
    let subtitle: String
    let icon: String
    let color: Color
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            HStack(spacing: 10) {
                ZStack {
                    RoundedRectangle(cornerRadius: 14, style: .continuous)
                        .fill(color.opacity(0.18))
                        .frame(width: 38, height: 38)
                    Image(systemName: icon)
                        .font(.subheadline.weight(.bold))
                        .foregroundStyle(color)
                }

                VStack(alignment: .leading, spacing: 1) {
                    Text(title)
                        .font(.subheadline.weight(.semibold))
                    if !subtitle.isEmpty {
                        Text(subtitle)
                            .font(.caption2)
                            .foregroundStyle(.secondary)
                            .lineLimit(1)
                    }
                }

                Spacer()

                Image(systemName: "chevron.right")
                    .font(.caption2)
                    .foregroundStyle(.tertiary)
            }
            .glassCard(cornerRadius: 20, padding: 14)
            .overlay {
                RoundedRectangle(cornerRadius: 20, style: .continuous)
                    .stroke(color.opacity(0.15), lineWidth: 1)
            }
        }
        .buttonStyle(LiftButtonStyle())
    }
}

struct ModeSelectorCard: View {
    let mode: WorkoutViewModel.WorkoutMode
    let isSelected: Bool
    let namespace: Namespace.ID
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            HStack(spacing: 8) {
                Image(systemName: mode.symbolName)
                    .font(.caption.weight(.bold))
                    .foregroundStyle(mode.accentColor)
                Text(mode.displayName)
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(isSelected ? .primary : .secondary)
                    .lineLimit(1)
            }
            .frame(maxWidth: .infinity)
            .padding(.vertical, 9)
            .background {
                RoundedRectangle(cornerRadius: 16, style: .continuous)
                    .fill(
                        LinearGradient(
                            colors: isSelected
                                ? [
                                    mode.secondaryColor.opacity(mode == .beast ? 0.24 : mode == .monk ? 0.18 : 0.16),
                                    mode.accentColor.opacity(mode == .beast ? 0.14 : mode == .monk ? 0.12 : 0.10)
                                ]
                                : [
                                    Color.white.opacity(0.03),
                                    Color.white.opacity(0.02)
                                ],
                            startPoint: .topLeading,
                            endPoint: .bottomTrailing
                        )
                    )
                    .overlay {
                        if isSelected {
                            RoundedRectangle(cornerRadius: 16, style: .continuous)
                                .fill(
                                    LinearGradient(
                                        colors: [mode.accentColor.opacity(0.10), .clear],
                                        startPoint: .topLeading,
                                        endPoint: .bottomTrailing
                                    )
                                )
                                .matchedGeometryEffect(id: "selected-mode-background", in: namespace)
                        }
                    }
            }
            .overlay {
                RoundedRectangle(cornerRadius: 16, style: .continuous)
                    .stroke(
                        isSelected ? mode.accentColor.opacity(0.45) : .white.opacity(0.06),
                        lineWidth: 0.9
                    )
            }
        }
        .buttonStyle(.plain)
    }
}

struct TemplateRow: View {
    let template: WorkoutTemplate
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            HStack {
                VStack(alignment: .leading, spacing: 3) {
                    Text(template.name)
                        .font(.subheadline.weight(.semibold))
                    Text("\(template.templateExercises.count) exercices")
                        .font(.caption2)
                        .foregroundStyle(.secondary)
                }
                Spacer()
                Image(systemName: "play.circle.fill")
                    .font(.subheadline)
                    .foregroundStyle(Color.accentColor)
            }
            .glassCard(cornerRadius: 20, padding: 14)
        }
        .buttonStyle(LiftButtonStyle(scale: 0.99))
    }
}

struct RecentWorkoutRow: View {
    let session: WorkoutSession

    var body: some View {
        HStack {
            VStack(alignment: .leading, spacing: 3) {
                Text(session.date.relativeDay)
                    .font(.caption.weight(.medium))
                HStack(spacing: 6) {
                    Text("\(session.totalWorkSets) sets")
                    Text(session.durationFormatted)
                }
                .font(.caption2)
                .foregroundStyle(.secondary)
            }
            Spacer()
            Image(systemName: "chevron.right")
                .font(.caption2)
                .foregroundStyle(.tertiary)
        }
        .glassCard(padding: 14)
    }
}

// MARK: - Achievements Section (Home Bottom)

private struct AchievementsKey: Hashable {
    let sessionCount: Int
    let exerciseCount: Int
    /// Rolling hash of the 5 most recent sessions so the key changes when any
    /// recent workout is added, finished, or has its sets count modified.
    let recentSessionsHash: Int
}

struct AchievementsSection: View {
    let sessions: [WorkoutSession]
    @Query(sort: \Exercise.name) private var exercises: [Exercise]
    @State private var achievements: [Achievement] = []

    private var taskKey: AchievementsKey {
        var hasher = Hasher()
        for s in sessions.prefix(5) {
            hasher.combine(s.id)
            hasher.combine(s.totalWorkSets)
        }
        return AchievementsKey(
            sessionCount: sessions.count,
            exerciseCount: exercises.count,
            recentSessionsHash: hasher.finalize()
        )
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            if !achievements.isEmpty {
                Text("Records récents")
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(.secondary)
                    .padding(.horizontal)

                ForEach(achievements.prefix(10)) { achievement in
                    AchievementRow(achievement: achievement)
                        .padding(.horizontal)
                        .scrollTransition(.animated(.smooth(duration: 0.28, extraBounce: 0.02))) { content, phase in
                            content
                                .scaleEffect(phase.isIdentity ? 1 : 0.98)
                                .opacity(phase.isIdentity ? 1 : 0.74)
                        }
                }
            }
        }
        .task(id: taskKey) {
            achievements = computeAchievements()
        }
        .onChange(of: sessions.count) {
            achievements = computeAchievements()
        }
        .onChange(of: exercises.count) {
            achievements = computeAchievements()
        }
    }

    private func computeAchievements() -> [Achievement] {
        guard !sessions.isEmpty, !exercises.isEmpty else { return [] }
        return AchievementsEngine.recentAchievements(
            sessions: sessions,
            exercises: exercises,
            maxSessions: 15
        )
    }
}

struct AchievementRow: View {
    let achievement: Achievement

    var body: some View {
        GlassCard(padding: 10, cornerRadius: 14) {
            HStack(spacing: 10) {
                Image(systemName: "star.fill")
                    .font(.caption)
                    .foregroundStyle(.yellow)

                VStack(alignment: .leading, spacing: 2) {
                    Text(achievement.exerciseName)
                        .font(.subheadline.weight(.semibold))
                        .lineLimit(1)
                    Text(recordDescription)
                        .font(.caption2)
                        .foregroundStyle(.secondary)
                        .lineLimit(1)
                }

                Spacer()

                Text(achievement.date.relativeDay)
                    .font(.caption2)
                    .foregroundStyle(.tertiary)
                    .lineLimit(1)
            }
        }
    }

    private var recordDescription: String {
        switch achievement.kind {
        case .heaviestWeight:
            return "Nouveau record : \(achievement.weight.cleanWeight) kg x \(achievement.reps)"
        case .repsAtWeight:
            return "\(achievement.reps) reps @ \(achievement.weight.cleanWeight) kg — record"
        case .bodyweightReps:
            return "BW x \(achievement.reps) — record reps"
        case .estimated1RM:
            let e1rm = ProgressionEngine.estimated1RM(weight: achievement.weight, reps: achievement.reps) ?? 0
            return "e1RM \(Int(e1rm)) kg (via \(achievement.weight.cleanWeight) x \(achievement.reps))"
        }
    }
}
