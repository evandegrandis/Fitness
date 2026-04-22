import SwiftUI
import SwiftData

struct ActiveWorkoutView: View {
    @Bindable var viewModel: WorkoutViewModel
    @State private var showFinishAlert = false
    @State private var showExercisePicker = false

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
        }
        .animation(.spring(response: 0.3), value: viewModel.restTimer.isRunning)
        .animation(.spring(response: 0.3), value: viewModel.showUndo)
        .animation(.spring(response: 0.4), value: viewModel.showAchievement)
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
        switch viewModel.activeWorkoutMode {
        case .beast:
            LinearGradient(
                colors: [
                    Color.red.opacity(0.16),
                    Color.purple.opacity(0.10),
                    Color.clear
                ],
                startPoint: .topLeading,
                endPoint: .bottomTrailing
            )
            .ignoresSafeArea()
            .allowsHitTesting(false)
        case .monk:
            LinearGradient(
                colors: [
                    Color.green.opacity(0.14),
                    Color.blue.opacity(0.08),
                    Color.clear
                ],
                startPoint: .topLeading,
                endPoint: .bottomTrailing
            )
            .ignoresSafeArea()
            .allowsHitTesting(false)
        case .normal:
            Color.clear
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
        HStack {
            VStack(alignment: .leading, spacing: 3) {
                HStack(spacing: 6) {
                    Text("Séance")
                    if mode != .normal {
                        Text(mode.displayName.uppercased())
                            .font(.caption2.weight(.bold))
                            .padding(.horizontal, 7)
                            .padding(.vertical, 2)
                            .background(modeChipColor.opacity(0.22), in: Capsule())
                            .foregroundStyle(modeChipColor)
                    }
                }
                    .font(.title3.weight(.bold))
                HStack(spacing: 12) {
                    Label(elapsedFormatted, systemImage: "clock")
                    Label("\(totalSets) sets", systemImage: "checkmark.circle")
                }
                .font(.caption)
                .foregroundStyle(.secondary)
            }
            Spacer()
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
