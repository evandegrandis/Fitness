import SwiftUI
import SwiftData

struct ActiveWorkoutView: View {
    @Bindable var viewModel: WorkoutViewModel
    @State private var showFinishAlert = false
    @State private var showExercisePicker = false
    @State private var modeIntroVisible = false
    @State private var modeAuraPulse = false

    var body: some View {
        ZStack(alignment: .bottom) {
            modeBackdrop

            // A List (not a ScrollView) so that .swipeActions inside each
            // ExerciseCard actually fires. The list style + transparent row
            // backgrounds make it look like an airy scroll view.
            List {
                Section {
                    WorkoutHeaderView(
                        session: viewModel.activeSession,
                        elapsedFormatted: viewModel.workoutElapsedFormatted,
                        totalSets: viewModel.activeSession?.totalWorkSets ?? 0,
                        mode: viewModel.activeWorkoutMode
                    )
                    .listRowBackground(Color.clear)
                    .listRowSeparator(.hidden)
                    .listRowInsets(EdgeInsets(top: 4, leading: 20, bottom: 4, trailing: 20))

                    if viewModel.activeWorkoutMode != .normal {
                        ModeFocusBanner(mode: viewModel.activeWorkoutMode)
                            .listRowBackground(Color.clear)
                            .listRowSeparator(.hidden)
                            .listRowInsets(EdgeInsets(top: 2, leading: 20, bottom: 4, trailing: 20))
                    }

                    if let session = viewModel.activeSession {
                        WeeklyPrioritySection(liveSession: session)
                            .listRowBackground(Color.clear)
                            .listRowSeparator(.hidden)
                            .listRowInsets(EdgeInsets(top: 4, leading: 0, bottom: 4, trailing: 0))
                    }
                }

                if let session = viewModel.activeSession {
                    Section {
                        ForEach(session.orderedExercises) { loggedExercise in
                            ExerciseCard(
                                loggedExercise: loggedExercise,
                                viewModel: viewModel
                            )
                            .listRowBackground(Color.clear)
                            .listRowSeparator(.hidden)
                            .listRowInsets(EdgeInsets(top: 6, leading: 0, bottom: 6, trailing: 0))
                            .transition(.opacity)
                        }
                        .onMove { from, to in
                            withAnimation(.spring(response: 0.3)) {
                                viewModel.moveExercise(from: from, to: to)
                            }
                        }
                    }
                }

                Section {
                    Button {
                        showExercisePicker = true
                        HapticManager.tap()
                    } label: {
                        HStack(spacing: 8) {
                            Image(systemName: "plus.circle.fill")
                                .font(.body)
                                .foregroundStyle(Color.accentColor)
                            Text("Ajouter un exercice")
                                .font(.subheadline.weight(.medium))
                                .foregroundStyle(.secondary)
                        }
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 14)
                        .background {
                            RoundedRectangle(cornerRadius: 22, style: .continuous)
                                .stroke(Color.accentColor.opacity(0.28), style: StrokeStyle(lineWidth: 1, dash: [6, 4]))
                        }
                        .padding(.horizontal, 16)
                    }
                    .buttonStyle(.plain)
                    .listRowBackground(Color.clear)
                    .listRowSeparator(.hidden)
                    .listRowInsets(EdgeInsets(top: 8, leading: 0, bottom: 8, trailing: 0))
                }

                // Bottom breathing room so the rest timer / toast don't collide.
                Color.clear
                    .frame(height: viewModel.restTimer.isRunning ? 100 : 40)
                    .listRowBackground(Color.clear)
                    .listRowSeparator(.hidden)
            }
            .listStyle(.plain)
            .scrollContentBackground(.hidden)
            .environment(\.defaultMinListRowHeight, 0)

            // Rest Timer
            if viewModel.restTimer.isRunning {
                RestTimerView(
                    timer: viewModel.restTimer,
                    suggestedSeconds: viewModel.currentRestSuggested
                ) {
                    viewModel.skipRest()
                }
                .padding(.bottom, 8)
                .transition(.move(edge: .bottom).combined(with: .opacity))
            }

            // Undo Toast
            if viewModel.showUndo, let message = viewModel.undoMessage {
                UndoToast(message: message) {
                    viewModel.undoAction?()
                    viewModel.showUndo = false
                }
                .padding(.bottom, viewModel.restTimer.isRunning ? 80 : 8)
                .transition(.move(edge: .bottom).combined(with: .opacity))
            }

            // Achievement overlay
            if viewModel.showAchievement, let achievement = viewModel.currentAchievement {
                AchievementOverlayView(achievement: achievement)
                    .transition(.scale.combined(with: .opacity))
                    .zIndex(100)
            }

            if modeIntroVisible, viewModel.activeWorkoutMode != .normal {
                ModeTransitionOverlay(mode: viewModel.activeWorkoutMode)
                    .transition(.asymmetric(insertion: .opacity.combined(with: .scale(scale: 1.08)),
                                            removal: .opacity))
                    .zIndex(90)
                    .allowsHitTesting(false)
            }
        }
        .animation(.spring(response: 0.3), value: viewModel.restTimer.isRunning)
        .animation(.spring(response: 0.3), value: viewModel.showUndo)
        .animation(.spring(response: 0.4), value: viewModel.showAchievement)
        .animation(.spring(response: 0.55, dampingFraction: 0.82), value: viewModel.activeWorkoutMode)
        .onAppear {
            modeAuraPulse = true
            triggerModeIntroIfNeeded()
        }
        .onChange(of: viewModel.activeWorkoutMode) { _, _ in
            triggerModeIntroIfNeeded()
        }
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                Button {
                    showFinishAlert = true
                } label: {
                    Text("Terminer")
                        .font(.subheadline.weight(.bold))
                        .foregroundStyle(.green)
                }
            }
        }
        .sheet(isPresented: $showExercisePicker) {
            ExercisePickerView { exercise in
                viewModel.addExercise(exercise)
            }
        }
        .alert("Terminer la séance ?", isPresented: $showFinishAlert) {
            Button("Terminer", role: .none) {
                viewModel.finishWorkout()
            }
            Button("Supprimer", role: .destructive) {
                viewModel.discardWorkout()
            }
            Button("Annuler", role: .cancel) { }
        } message: {
            if let session = viewModel.activeSession {
                Text("\(session.totalWorkSets) sets \u{2022} \(viewModel.workoutElapsedFormatted)")
            }
        }
    }

    @ViewBuilder
    private var modeBackdrop: some View {
        ZStack {
            switch viewModel.activeWorkoutMode {
            case .beast:
                LinearGradient(
                    colors: [
                        Color(red: 0.36, green: 0.07, blue: 0.05).opacity(0.92),
                        Color(red: 0.23, green: 0.03, blue: 0.08).opacity(0.78),
                        Color.clear
                    ],
                    startPoint: .topLeading,
                    endPoint: .bottomTrailing
                )

                AngularGradient(
                    colors: [
                        Color.orange.opacity(0.32),
                        Color.red.opacity(0.14),
                        Color.clear,
                        Color.orange.opacity(0.18)
                    ],
                    center: .topTrailing
                )

                RadialGradient(
                    colors: [
                        Color.orange.opacity(modeAuraPulse ? 0.24 : 0.10),
                        Color.clear
                    ],
                    center: .bottomLeading,
                    startRadius: 0,
                    endRadius: modeAuraPulse ? 420 : 300
                )
            case .monk:
                LinearGradient(
                    colors: [
                        Color(red: 0.05, green: 0.21, blue: 0.18).opacity(0.90),
                        Color(red: 0.06, green: 0.15, blue: 0.21).opacity(0.72),
                        Color.clear
                    ],
                    startPoint: .topLeading,
                    endPoint: .bottomTrailing
                )

                RadialGradient(
                    colors: [
                        Color.green.opacity(modeAuraPulse ? 0.22 : 0.10),
                        Color.clear
                    ],
                    center: .top,
                    startRadius: 0,
                    endRadius: modeAuraPulse ? 390 : 280
                )

                LinearGradient(
                    colors: [
                        Color.teal.opacity(0.16),
                        Color.clear,
                        Color.blue.opacity(0.10)
                    ],
                    startPoint: .leading,
                    endPoint: .trailing
                )
            case .normal:
                Color.clear
            }
        }
        .ignoresSafeArea()
        .allowsHitTesting(false)
        .animation(.easeInOut(duration: 2.4).repeatForever(autoreverses: true), value: modeAuraPulse)
    }

    private func triggerModeIntroIfNeeded() {
        guard viewModel.activeWorkoutMode != .normal else {
            modeIntroVisible = false
            return
        }
        modeIntroVisible = true
        DispatchQueue.main.asyncAfter(deadline: .now() + 1.1) {
            withAnimation(.easeOut(duration: 0.35)) {
                modeIntroVisible = false
            }
        }
    }
}

// MARK: - Workout Header

struct WorkoutHeaderView: View {
    let session: WorkoutSession?
    var elapsedFormatted: String = "--"
    var totalSets: Int = 0
    var mode: WorkoutViewModel.WorkoutMode = .normal

    var body: some View {
        GlassCard(padding: 16, cornerRadius: 28) {
            HStack(spacing: 14) {
                VStack(alignment: .leading, spacing: 10) {
                    HStack(spacing: 6) {
                        Text("Séance")
                        if mode != .normal {
                            Label(mode.displayName.uppercased(), systemImage: mode.symbolName)
                                .font(.caption2.weight(.bold))
                                .padding(.horizontal, 9)
                                .padding(.vertical, 4)
                                .background(modeChipColor.opacity(0.22), in: Capsule())
                                .foregroundStyle(modeChipColor)
                        }
                    }
                    .font(.title3.weight(.bold))

                    HStack(spacing: 10) {
                        workoutMetric(elapsedFormatted, icon: "clock")
                        workoutMetric("\(totalSets) sets", icon: "checkmark.circle")
                    }
                }
                Spacer()
                ZStack {
                    Circle()
                        .fill(modeChipColor.opacity(0.14))
                        .frame(width: 48, height: 48)
                    Image(systemName: mode.symbolName)
                        .font(.system(size: 18, weight: .bold))
                        .foregroundStyle(modeChipColor)
                }
            }
        }
    }

    private var modeChipColor: Color {
        switch mode {
        case .normal:
            return .secondary
        case .beast:
            return .orange
        case .monk:
            return .green
        }
    }

    private func workoutMetric(_ value: String, icon: String) -> some View {
        Label(value, systemImage: icon)
            .font(.caption.weight(.medium))
            .foregroundStyle(.secondary)
            .padding(.horizontal, 10)
            .padding(.vertical, 7)
            .background(Color.white.opacity(0.05), in: Capsule())
    }
}

private struct ModeFocusBanner: View {
    let mode: WorkoutViewModel.WorkoutMode

    var body: some View {
        GlassCard(padding: 14, cornerRadius: 24) {
            HStack(alignment: .top, spacing: 12) {
                ZStack {
                    RoundedRectangle(cornerRadius: 16, style: .continuous)
                        .fill(mode.accentColor.opacity(0.16))
                        .frame(width: 42, height: 42)
                    Image(systemName: mode.symbolName)
                        .font(.system(size: 16, weight: .bold))
                        .foregroundStyle(mode.accentColor)
                }

                VStack(alignment: .leading, spacing: 4) {
                    Text(mode == .beast ? "Session brute" : "Session Monk")
                        .font(.subheadline.weight(.bold))
                    Text(modeBannerCopy)
                        .font(.caption)
                        .foregroundStyle(.secondary)
                        .fixedSize(horizontal: false, vertical: true)
                }

                Spacer()
            }
            .frame(maxWidth: .infinity, alignment: .leading)
        }
        .overlay {
            RoundedRectangle(cornerRadius: 24, style: .continuous)
                .stroke(mode.accentColor.opacity(0.22), lineWidth: 1)
        }
    }

    private var modeBannerCopy: String {
        switch mode {
        case .normal:
            return ""
        case .beast:
            return "Base familière, charge plus agressive. Cherche le lourd propre sans dériver sur les reps."
        case .monk:
            return "Base familière, déficit hebdo priorisé. Laisse respirer les muscles déjà taxés."
        }
    }
}

private struct ModeTransitionOverlay: View {
    let mode: WorkoutViewModel.WorkoutMode
    @State private var hasAnimatedIn = false

    var body: some View {
        ZStack {
            Rectangle()
                .fill(.black.opacity(0.18))
                .ignoresSafeArea()

            VStack(spacing: 12) {
                ZStack {
                    Circle()
                        .fill(mode.accentColor.opacity(0.22))
                        .frame(width: 88, height: 88)
                    Circle()
                        .stroke(mode.accentColor.opacity(0.40), lineWidth: 1)
                        .frame(width: 104, height: 104)
                    Image(systemName: mode.symbolName)
                        .font(.system(size: 28, weight: .bold))
                        .foregroundStyle(mode.accentColor)
                }

                Text(mode.displayName.uppercased())
                    .font(.title3.weight(.black))
                    .tracking(1.8)

                Text(mode.shortDescription)
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
            .padding(.horizontal, 26)
            .padding(.vertical, 24)
            .background(.ultraThinMaterial, in: RoundedRectangle(cornerRadius: 28, style: .continuous))
            .overlay {
                RoundedRectangle(cornerRadius: 28, style: .continuous)
                    .stroke(mode.accentColor.opacity(0.30), lineWidth: 1)
            }
            .scaleEffect(hasAnimatedIn ? 1 : 0.92)
            .opacity(hasAnimatedIn ? 1 : 0)
            .blur(radius: hasAnimatedIn ? 0 : 10)
            .onAppear {
                withAnimation(.spring(response: 0.45, dampingFraction: 0.78)) {
                    hasAnimatedIn = true
                }
            }
        }
    }
}

// MARK: - Undo Toast

struct UndoToast: View {
    let message: String
    let onUndo: () -> Void

    var body: some View {
        HStack {
            Text(message)
                .font(.caption.weight(.medium))
            Spacer()
            Button("Undo") {
                onUndo()
            }
            .font(.caption.weight(.bold))
            .foregroundStyle(Color.accentColor)
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 10)
        .background {
            Capsule()
                .fill(Color(red: 0.14, green: 0.15, blue: 0.22).opacity(0.98))
        }
        .overlay {
            Capsule()
                .stroke(.white.opacity(0.12), lineWidth: 0.5)
        }
        .padding(.horizontal, 32)
    }
}
