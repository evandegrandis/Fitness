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
                            color: .orange,
                            mode: viewModel.selectedStartMode
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

    private var performedExercises: [LoggedExercise] {
        session.orderedExercises.filter { !$0.completedWorkSets.isEmpty }
    }

    private struct DetailBlock: Identifiable {
        let id: UUID
        let members: [LoggedExercise]

        var isSuperset: Bool { members.count > 1 }
    }

    private var detailBlocks: [DetailBlock] {
        var blocks: [DetailBlock] = []
        var consumed: Set<UUID> = []

        for exercise in performedExercises {
            guard !consumed.contains(exercise.id) else { continue }

            if let group = exercise.supersetGroup {
                let members = group.orderedMembers.filter { !$0.completedWorkSets.isEmpty }
                if members.count > 1 {
                    blocks.append(DetailBlock(id: group.id, members: members))
                    members.forEach { consumed.insert($0.id) }
                    continue
                }
            }

            blocks.append(DetailBlock(id: exercise.id, members: [exercise]))
            consumed.insert(exercise.id)
        }

        return blocks
    }

    var body: some View {
        ScrollView {
            LazyVStack(spacing: 8) {
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
                .padding(.horizontal, 14)

                // Exercises
                ForEach(detailBlocks) { block in
                    if block.isSuperset {
                        HistorySupersetBlock(
                            members: block.members,
                            allSessions: allSessions,
                            sessionDate: session.date
                        )
                        .padding(.horizontal)
                    } else if let loggedExercise = block.members.first {
                        HistoryExerciseCard(
                            loggedExercise: loggedExercise,
                            allSessions: allSessions,
                            sessionDate: session.date
                        )
                        .padding(.horizontal)
                    }
                }

                Spacer(minLength: 24)
            }
            .padding(.top, 6)
        }
        .background { BackgroundGradient() }
        .navigationBarTitleDisplayMode(.inline)
    }
}

struct HistorySupersetBlock: View {
    let members: [LoggedExercise]
    var allSessions: [WorkoutSession] = []
    var sessionDate: Date = Date()

    private var roundCount: Int {
        members
            .flatMap(\.completedWorkSets)
            .compactMap(\.supersetRoundIndex)
            .max() ?? 0
    }

    var body: some View {
        GlassCard(padding: 11, cornerRadius: 16) {
            VStack(alignment: .leading, spacing: 7) {
                HStack {
                    HStack(spacing: 6) {
                        Image(systemName: "link")
                            .font(.caption2.weight(.bold))
                            .foregroundStyle(Color.accentColor)
                        Text(members.compactMap { $0.exercise?.name }.joined(separator: " · "))
                            .font(.subheadline.weight(.semibold))
                            .lineLimit(2)
                    }
                    Spacer()
                    Text("\(roundCount) rounds")
                        .font(.caption2.weight(.medium))
                        .foregroundStyle(.orange)
                }

                ForEach(members) { loggedExercise in
                    VStack(alignment: .leading, spacing: 4) {
                        Text(loggedExercise.exercise?.name ?? "Unknown")
                            .font(.caption2.weight(.semibold))
                            .foregroundStyle(.secondary)

                        HistorySetLines(
                            loggedExercise: loggedExercise,
                            allSessions: allSessions,
                            sessionDate: sessionDate
                        )
                    }
                    .padding(.top, loggedExercise.id == members.first?.id ? 0 : 1)
                }
            }
        }
        .overlay {
            RoundedRectangle(cornerRadius: 16, style: .continuous)
                .stroke(.orange.opacity(0.22), lineWidth: 1)
        }
    }
}

private struct HistorySetLines: View {
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

    private var displayedRecordSetIDs: Set<UUID> {
        guard let exercise = loggedExercise.exercise else { return [] }
        return RecordsEngine.displayedRecordSetIDs(
            in: loggedExercise,
            among: allHistoricalSets,
            exercise: exercise
        )
    }

    var body: some View {
        LazyVGrid(columns: [GridItem(.adaptive(minimum: 104), spacing: 6)], spacing: 6) {
            ForEach(loggedExercise.orderedSets) { set in
                HistorySetChip(
                    set: set,
                    isRecord: displayedRecordSetIDs.contains(set.id)
                )
            }
        }
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
        return displayedRecordSetIDs.contains(set.id)
    }

    private var displayedRecordSetIDs: Set<UUID> {
        guard let exercise = loggedExercise.exercise else { return [] }
        return RecordsEngine.displayedRecordSetIDs(
            in: loggedExercise,
            among: allHistoricalSets,
            exercise: exercise
        )
    }

    var body: some View {
        GlassCard(padding: 11, cornerRadius: 15) {
            VStack(alignment: .leading, spacing: 6) {
                HStack {
                    HStack(spacing: 6) {
                        Text(loggedExercise.exercise?.name ?? "Unknown")
                            .font(.subheadline.weight(.semibold))
                    }
                    Spacer()
                    Text("\(loggedExercise.completedWorkSets.count) sets")
                        .font(.caption2)
                        .foregroundStyle(.secondary)
                }

                LazyVGrid(columns: [GridItem(.adaptive(minimum: 108), spacing: 6)], spacing: 6) {
                    ForEach(loggedExercise.orderedSets) { set in
                        HistorySetChip(
                            set: set,
                            isRecord: isRecord(set)
                        )
                    }
                }
            }
        }
        .overlay {
            if loggedExercise.supersetGroup != nil {
                RoundedRectangle(cornerRadius: 15, style: .continuous)
                    .stroke(.orange.opacity(0.18), lineWidth: 0.8)
            }
        }
    }
}

private struct HistorySetChip: View {
    let set: LoggedSet
    let isRecord: Bool

    private var valueText: String {
        if set.weight > 0 {
            return "\(set.weight.cleanWeight)×\(set.reps)"
        }
        return "BW×\(set.reps)"
    }

    var body: some View {
        HStack(spacing: 5) {
            Text("#\(set.setSlotIndex + 1)")
                .font(.system(size: 9, weight: .bold, design: .rounded).monospacedDigit())
                .foregroundStyle(.tertiary)

            if let round = set.supersetRoundIndex {
                Text("r\(round)")
                    .font(.system(size: 9, weight: .bold, design: .rounded))
                    .foregroundStyle(.secondary)
            }

            Text(valueText)
                .font(.system(size: 11, weight: .semibold, design: .rounded).monospacedDigit())
                .lineLimit(1)

            if set.setType != .work {
                Text(set.setType.shortLabel)
                    .font(.system(size: 8, weight: .bold, design: .rounded))
                    .foregroundStyle(set.setType == .topSet ? .orange : .blue)
            }

            if isRecord {
                Image(systemName: "star.fill")
                    .font(.system(size: 8))
                    .foregroundStyle(.yellow)
            }

            Spacer(minLength: 0)
        }
        .padding(.horizontal, 8)
        .padding(.vertical, 6)
        .background(Color.white.opacity(0.045), in: RoundedRectangle(cornerRadius: 11, style: .continuous))
    }
}

// MARK: - Supporting Views

struct QuickStartButton: View {
    let title: String
    let subtitle: String
    let icon: String
    let color: Color
    var mode: WorkoutViewModel.WorkoutMode? = nil
    let action: () -> Void
    @State private var animateAccent = false
    @State private var flarePhase = false

    private var activeMode: WorkoutViewModel.WorkoutMode? {
        mode
    }

    private var displayIcon: String {
        guard let activeMode else { return icon }
        return activeMode.symbolName
    }

    private var accentColor: Color {
        activeMode?.accentColor ?? color
    }

    private var panelGradient: LinearGradient {
        guard let activeMode else {
            return LinearGradient(
                colors: [Color.white.opacity(0.04), Color.white.opacity(0.02)],
                startPoint: .topLeading,
                endPoint: .bottomTrailing
            )
        }

        return LinearGradient(
            colors: [
                activeMode.secondaryColor.opacity(activeMode == .normal ? 0.18 : 0.26),
                activeMode.accentColor.opacity(activeMode == .normal ? 0.08 : 0.14)
            ],
            startPoint: .topLeading,
            endPoint: .bottomTrailing
        )
    }

    var body: some View {
        Button(action: action) {
            HStack(spacing: 10) {
                ZStack {
                    RoundedRectangle(cornerRadius: 14, style: .continuous)
                        .fill(accentColor.opacity(0.18))
                        .frame(width: 38, height: 38)

                    if let activeMode, activeMode != .normal {
                        Circle()
                            .fill(accentColor.opacity(0.18))
                            .frame(width: flarePhase ? 32 : 22, height: flarePhase ? 32 : 22)
                            .blur(radius: flarePhase ? 10 : 4)
                            .opacity(flarePhase ? 0.98 : 0.38)

                        ambientOrbit(mode: activeMode)
                    }

                    Image(systemName: displayIcon)
                        .font(.subheadline.weight(.bold))
                        .foregroundStyle(accentColor)
                        .scaleEffect(iconScale)
                        .rotationEffect(iconRotation)
                        .offset(y: iconYOffset)
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
            .background(panelGradient, in: RoundedRectangle(cornerRadius: 20, style: .continuous))
            .overlay {
                RoundedRectangle(cornerRadius: 20, style: .continuous)
                    .stroke(accentColor.opacity(activeMode == nil ? 0.15 : 0.28), lineWidth: 1)
            }
            .overlay(alignment: .topLeading) {
                if let activeMode, activeMode != .normal {
                    Capsule()
                        .fill(activeMode.accentColor.opacity(0.12))
                        .overlay {
                            Text(activeMode.displayName.uppercased())
                                .font(.system(size: 8, weight: .black, design: .rounded))
                                .tracking(0.8)
                                .foregroundStyle(activeMode.accentColor.opacity(0.95))
                                .padding(.horizontal, 6)
                        }
                        .frame(height: 18)
                        .padding(.leading, 12)
                        .padding(.top, 10)
                        .transition(.opacity.combined(with: .scale(scale: 0.9)))
                }
            }
        }
        .buttonStyle(LiftButtonStyle())
        .onAppear {
            animateAccent = true
            flarePhase = true
        }
        .onChange(of: mode?.rawValue) { _, _ in
            animateAccent = false
            flarePhase = false
            withAnimation(.spring(response: 0.28, dampingFraction: 0.7)) {
                animateAccent = true
                flarePhase = true
            }
        }
        .animation(animationStyle, value: animateAccent)
        .animation(animationStyle, value: flarePhase)
    }

    private var iconScale: CGFloat {
        guard let activeMode else { return 1 }
        switch activeMode {
        case .normal:
            return 1
        case .beast:
            return flarePhase ? 1.12 : 0.94
        case .monk:
            return flarePhase ? 1.05 : 0.97
        }
    }

    @ViewBuilder
    private func ambientOrbit(mode: WorkoutViewModel.WorkoutMode) -> some View {
        switch mode {
        case .normal:
            EmptyView()
        case .beast:
            ZStack {
                Circle()
                    .fill(accentColor.opacity(0.26))
                    .frame(width: 6, height: 6)
                    .offset(x: flarePhase ? 10 : 3, y: flarePhase ? -11 : -4)
                Circle()
                    .fill(accentColor.opacity(0.18))
                    .frame(width: 4, height: 4)
                    .offset(x: flarePhase ? -9 : -3, y: flarePhase ? -8 : -2)
            }
        case .monk:
            Capsule()
                .fill(accentColor.opacity(0.18))
                .frame(width: 18, height: 6)
                .rotationEffect(.degrees(flarePhase ? -18 : 14))
                .offset(x: flarePhase ? 8 : -6, y: flarePhase ? 11 : 7)
        }
    }

    private var iconRotation: Angle {
        guard let activeMode else { return .zero }
        switch activeMode {
        case .normal:
            return .zero
        case .beast:
            return .degrees(flarePhase ? -8 : 5)
        case .monk:
            return .degrees(flarePhase ? -4 : 3)
        }
    }

    private var iconYOffset: CGFloat {
        guard let activeMode else { return 0 }
        switch activeMode {
        case .normal:
            return 0
        case .beast:
            return flarePhase ? -1 : 1
        case .monk:
            return flarePhase ? 1 : -1
        }
    }

    private var animationStyle: Animation {
        guard let activeMode else { return .default }
        switch activeMode {
        case .normal:
            return .spring(response: 0.28, dampingFraction: 0.82)
        case .beast:
            return .easeInOut(duration: 0.48).repeatForever(autoreverses: true)
        case .monk:
            return .easeInOut(duration: 1.1).repeatForever(autoreverses: true)
        }
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
            return "\(achievement.weight.cleanWeight) kg × \(achievement.reps)"
        case .repsAtWeight:
            return "\(achievement.reps) reps @ \(achievement.weight.cleanWeight) kg"
        case .bodyweightReps:
            return "BW × \(achievement.reps)"
        case .estimated1RM:
            let e1rm = ProgressionEngine.estimated1RM(weight: achievement.weight, reps: achievement.reps) ?? 0
            return "e1RM \(Int(e1rm)) kg"
        }
    }
}
