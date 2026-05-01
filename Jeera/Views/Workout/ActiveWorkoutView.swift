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
                    .listRowInsets(EdgeInsets(top: 2, leading: 16, bottom: 2, trailing: 16))
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
                            .listRowInsets(EdgeInsets(top: 3, leading: 0, bottom: 3, trailing: 0))
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
                                .font(.subheadline)
                                .foregroundStyle(Color.accentColor)
                            Text("Ajouter un exercice")
                                .font(.caption.weight(.semibold))
                                .foregroundStyle(.secondary)
                        }
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 8)
                        .background {
                            RoundedRectangle(cornerRadius: 18, style: .continuous)
                                .stroke(Color.accentColor.opacity(0.28), style: StrokeStyle(lineWidth: 1, dash: [6, 4]))
                        }
                        .padding(.horizontal, 16)
                    }
                    .buttonStyle(.plain)
                    .listRowBackground(Color.clear)
                    .listRowSeparator(.hidden)
                    .listRowInsets(EdgeInsets(top: 6, leading: 0, bottom: 6, trailing: 0))
                }

                // Bottom breathing room so the rest timer / toast don't collide.
                Color.clear
                    .frame(height: viewModel.restTimer.isRunning ? 210 : 98)
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
                .padding(.bottom, 12)
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
        .safeAreaInset(edge: .top, spacing: 0) {
            workoutPriorityDock
        }
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

    private var workoutPriorityDock: some View {
        VStack(spacing: 0) {
            WeeklyPrioritySection(
                liveSession: viewModel.activeSession,
                style: .activeWorkout
            )
            .padding(.top, 2)
            .padding(.bottom, 4)
        }
        .background(
            Rectangle()
                .fill(Color.black.opacity(0.001))
                .background(.ultraThinMaterial.opacity(0.72))
        )
        .overlay(alignment: .bottom) {
            Rectangle()
                .fill(.white.opacity(0.06))
                .frame(height: 0.5)
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
        GlassCard(padding: 12, cornerRadius: 20) {
            VStack(spacing: 6) {
                Text(sessionTitle)
                    .font(.subheadline.weight(.bold))
                    .lineLimit(1)
                    .frame(maxWidth: .infinity, alignment: .center)

                HStack(spacing: 8) {
                    workoutMetric(elapsedFormatted, icon: "clock")
                    workoutMetric("\(totalSets) sets", icon: "checkmark.circle")
                }
                .frame(maxWidth: .infinity, alignment: .center)
            }
        }
    }

    private var sessionTitle: String {
        "Séance"
    }

    private func workoutMetric(_ value: String, icon: String) -> some View {
        Label(value, systemImage: icon)
            .font(.system(size: 11, weight: .medium, design: .rounded))
            .foregroundStyle(.secondary)
            .padding(.horizontal, 7)
            .padding(.vertical, 4)
            .background(Color.white.opacity(0.05), in: Capsule())
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
            Button("Annuler") {
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
