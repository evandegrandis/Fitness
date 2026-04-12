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
    @Query private var settingsArray: [UserSettings]

    @State private var showNewTemplate = false
    @State private var newTemplateName = ""
    @State private var templateToRename: WorkoutTemplate?
    @State private var renameText = ""
    @State private var templateToDelete: WorkoutTemplate?

    private var settings: UserSettings? { settingsArray.first }

    private var rollingProgress: [ParentMuscleProgress] {
        EffectiveSetsEngine.rolling7DayProgress(sessions: recentSessions, goals: goals)
    }

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

    private var greeting: String {
        Date.frenchGreeting(for: settings?.userName ?? "Evan")
    }

    private var statusLine: String {
        EffectiveSetsEngine.rollingStatusLine(progress: rollingProgress, sessions: recentSessions)
    }

    var body: some View {
        ScrollView {
            VStack(spacing: 24) {
                // Header - personalized greeting
                VStack(spacing: 6) {
                    Text(greeting)
                        .font(.title2.weight(.bold))
                    Text(statusLine)
                        .font(.caption)
                        .foregroundStyle(.secondary)
                        .multilineTextAlignment(.center)
                }
                .padding(.top, 12)

                // Weekly priority strip — horizontally scrolling chip row, live counts.
                WeeklyPrioritySection()

                // Quick Actions
                VStack(spacing: 10) {
                    if let recommended = recommendedTemplate {
                        QuickStartButton(
                            title: recommended.name,
                            subtitle: "Recommandé — couvre tes plus gros déficits",
                            icon: "star.circle.fill",
                            color: .orange
                        ) {
                            viewModel.startFromTemplate(recommended)
                        }
                    }

                    QuickStartButton(
                        title: "Séance vide",
                        subtitle: "Partir de zéro",
                        icon: "plus.circle.fill",
                        color: Color.accentColor
                    ) {
                        viewModel.startEmptyWorkout()
                    }

                    if !recentSessions.isEmpty {
                        QuickStartButton(
                            title: "Répéter la dernière",
                            subtitle: lastWorkoutSubtitle,
                            icon: "arrow.counterclockwise.circle.fill",
                            color: .blue
                        ) {
                            viewModel.repeatLastWorkout()
                        }
                    }
                }
                .padding(.horizontal)

                // Templates
                VStack(alignment: .leading, spacing: 10) {
                    HStack {
                        Text("Templates")
                            .font(.subheadline.weight(.semibold))
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
                            viewModel.startFromTemplate(template)
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
                    }
                }

                // Recent Achievements (records)
                AchievementsSection(sessions: recentSessions)

                Spacer(minLength: 80)
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
            HStack(spacing: 12) {
                Image(systemName: icon)
                    .font(.title3)
                    .foregroundStyle(color)

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
            .glassCard(padding: 14)
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
                        .font(.caption.weight(.semibold))
                    Text("\(template.templateExercises.count) exercises")
                        .font(.caption2)
                        .foregroundStyle(.secondary)
                }
                Spacer()
                Image(systemName: "play.circle.fill")
                    .font(.body)
                    .foregroundStyle(Color.accentColor)
            }
            .glassCard(padding: 14)
        }
        .buttonStyle(.plain)
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

struct AchievementsSection: View {
    let sessions: [WorkoutSession]
    @Query(sort: \Exercise.name) private var exercises: [Exercise]

    private var achievements: [Achievement] {
        AchievementsEngine.recentAchievements(
            sessions: sessions,
            exercises: exercises,
            maxSessions: 10
        )
    }

    var body: some View {
        if !achievements.isEmpty {
            VStack(alignment: .leading, spacing: 10) {
                Text("Records récents")
                    .font(.subheadline.weight(.semibold))
                    .foregroundStyle(.secondary)
                    .padding(.horizontal)

                ForEach(achievements.prefix(6)) { achievement in
                    AchievementRow(achievement: achievement)
                        .padding(.horizontal)
                }
            }
        }
    }
}

struct AchievementRow: View {
    let achievement: Achievement

    var body: some View {
        GlassCard(padding: 12, cornerRadius: 16) {
            HStack(spacing: 10) {
                Image(systemName: "star.fill")
                    .font(.caption)
                    .foregroundStyle(.yellow)

                VStack(alignment: .leading, spacing: 2) {
                    Text(achievement.exerciseName)
                        .font(.caption.weight(.semibold))
                    Text(recordDescription)
                        .font(.caption2)
                        .foregroundStyle(.secondary)
                }

                Spacer()

                Text(achievement.date.relativeDay)
                    .font(.caption2)
                    .foregroundStyle(.tertiary)
            }
        }
    }

    private var recordDescription: String {
        switch achievement.kind {
        case .heaviestWeight:
            return "Nouveau record : \(achievement.weight.cleanWeight) kg x \(achievement.reps)"
        case .repsAtWeight:
            return "\(achievement.reps) reps @ \(achievement.weight.cleanWeight) kg — record"
        }
    }
}
