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

    private var weekProgress: [MuscleGroupProgress] {
        EffectiveSetsEngine.currentWeekProgress(sessions: recentSessions, goals: goals)
    }

    private var muscleGaps: [(MuscleGroup, Double)] {
        weekProgress
            .filter { $0.remaining > 1 && $0.goalSets > 0 }
            .sorted { $0.remaining > $1.remaining }
            .map { ($0.muscleGroup, $0.remaining) }
    }

    private var recommendedTemplate: WorkoutTemplate? {
        guard !muscleGaps.isEmpty else { return templates.first }
        let topGaps = Set(muscleGaps.prefix(5).map(\.0))

        return templates.max(by: { a, b in
            templateGapScore(a, gaps: topGaps) < templateGapScore(b, gaps: topGaps)
        })
    }

    private func templateGapScore(_ template: WorkoutTemplate, gaps: Set<MuscleGroup>) -> Int {
        template.templateExercises.reduce(0) { score, te in
            guard let ex = te.exercise else { return score }
            let muscles = Set(ex.muscleMappings.filter { $0.coefficient >= 0.3 }.map(\.muscleGroup))
            return score + muscles.intersection(gaps).count
        }
    }

    private var greeting: String {
        Date.frenchGreeting(for: settings?.userName ?? "Evan")
    }

    private var statusLine: String {
        EffectiveSetsEngine.weeklyStatusLine(progress: weekProgress, sessions: recentSessions)
    }

    var body: some View {
        ScrollView {
            VStack(spacing: 20) {
                // Header - personalized greeting
                VStack(spacing: 4) {
                    Text(greeting)
                        .font(.title2.weight(.bold))
                    Text(statusLine)
                        .font(.caption)
                        .foregroundStyle(.secondary)
                        .multilineTextAlignment(.center)
                }
                .padding(.top, 12)

                // Muscle gaps summary
                if !muscleGaps.isEmpty {
                    muscleGapSection
                        .padding(.horizontal)
                }

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

                // Recent Workouts
                if !recentSessions.isEmpty {
                    VStack(alignment: .leading, spacing: 10) {
                        Text("Récent")
                            .font(.subheadline.weight(.semibold))
                            .foregroundStyle(.secondary)
                            .padding(.horizontal)

                        ForEach(recentSessions.prefix(5)) { session in
                            NavigationLink {
                                WorkoutDetailView(session: session)
                            } label: {
                                RecentWorkoutRow(session: session)
                            }
                            .buttonStyle(.plain)
                        }
                        .padding(.horizontal)
                    }
                }

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

    // MARK: - Muscle Gap Section

    private var muscleGapSection: some View {
        GlassCard(padding: 12, cornerRadius: 14) {
            VStack(alignment: .leading, spacing: 8) {
                HStack {
                    Text("Cette semaine")
                        .font(.caption.weight(.semibold))
                    Spacer()
                }

                // Gap chips
                let displayGaps = muscleGaps.prefix(6)
                LazyVGrid(columns: [
                    GridItem(.flexible()),
                    GridItem(.flexible()),
                    GridItem(.flexible())
                ], spacing: 6) {
                    ForEach(Array(displayGaps), id: \.0) { muscle, remaining in
                        HStack(spacing: 3) {
                            Text(muscle.displayName)
                                .font(.caption2)
                                .lineLimit(1)
                            Text("\(Int(remaining))")
                                .font(.caption2.weight(.bold).monospacedDigit())
                                .foregroundStyle(remaining > 10 ? .red : .orange)
                        }
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 4)
                        .background(Color.white.opacity(0.04), in: RoundedRectangle(cornerRadius: 6))
                    }
                }
            }
        }
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
                    HistoryExerciseCard(loggedExercise: loggedExercise)
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

    var body: some View {
        GlassCard(padding: 12, cornerRadius: 14) {
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
            .glassCard(padding: 12)
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
        .glassCard(padding: 10)
    }
}
