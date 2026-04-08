import SwiftUI
import SwiftData

struct ActiveWorkoutView: View {
    @Bindable var viewModel: WorkoutViewModel
    @State private var showFinishAlert = false

    var body: some View {
        ZStack(alignment: .bottom) {
            ScrollView {
                VStack(spacing: 14) {
                    // Workout Header
                    WorkoutHeaderView(session: viewModel.activeSession)
                        .padding(.horizontal)

                    // Exercise Cards
                    if let session = viewModel.activeSession {
                        ForEach(session.orderedExercises) { loggedExercise in
                            ExerciseCard(
                                loggedExercise: loggedExercise,
                                viewModel: viewModel
                            )
                            .padding(.horizontal)
                            .transition(.asymmetric(
                                insertion: .scale(scale: 0.9).combined(with: .opacity),
                                removal: .slide.combined(with: .opacity)
                            ))
                        }
                    }

                    // Add Exercise
                    Button {
                        viewModel.showExercisePicker = true
                        HapticManager.tap()
                    } label: {
                        HStack {
                            Image(systemName: "plus.circle.fill")
                                .font(.title3)
                            Text("Add Exercise")
                                .font(.subheadline.weight(.semibold))
                        }
                        .foregroundStyle(Color.accentColor)
                        .frame(maxWidth: .infinity)
                        .glassCard(padding: 14)
                    }
                    .buttonStyle(.plain)
                    .padding(.horizontal)

                    // Finish
                    Button {
                        showFinishAlert = true
                    } label: {
                        HStack {
                            Image(systemName: "checkmark.circle.fill")
                            Text("Finish Workout")
                                .font(.subheadline.weight(.semibold))
                        }
                        .foregroundStyle(.green)
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 14)
                        .background {
                            RoundedRectangle(cornerRadius: 16, style: .continuous)
                                .fill(.green.opacity(0.15))
                                .overlay {
                                    RoundedRectangle(cornerRadius: 16, style: .continuous)
                                        .stroke(.green.opacity(0.3), lineWidth: 0.5)
                                }
                        }
                    }
                    .buttonStyle(.plain)
                    .padding(.horizontal)

                    Spacer(minLength: 120)
                }
                .padding(.top, 8)
            }

            // Rest Timer
            if viewModel.restTimer.isRunning {
                RestTimerView(
                    timer: viewModel.restTimer,
                    suggestedSeconds: viewModel.currentRestSuggested
                ) {
                    viewModel.restTimer.reset()
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
        }
        .animation(.spring(response: 0.3), value: viewModel.restTimer.isRunning)
        .animation(.spring(response: 0.3), value: viewModel.showUndo)
        .sheet(isPresented: $viewModel.showExercisePicker) {
            ExercisePickerView { exercise in
                viewModel.addExercise(exercise)
                viewModel.showExercisePicker = false
            }
        }
        .alert("Finish Workout?", isPresented: $showFinishAlert) {
            Button("Finish", role: .none) {
                viewModel.finishWorkout()
            }
            Button("Discard", role: .destructive) {
                viewModel.discardWorkout()
            }
            Button("Cancel", role: .cancel) { }
        } message: {
            if let session = viewModel.activeSession {
                Text("\(session.totalWorkSets) sets logged \u{2022} \(session.durationFormatted)")
            }
        }
    }
}

struct WorkoutHeaderView: View {
    let session: WorkoutSession?

    var body: some View {
        HStack {
            VStack(alignment: .leading, spacing: 4) {
                Text("Active Workout")
                    .font(.title2.weight(.bold))
                if let session {
                    HStack(spacing: 12) {
                        Label(session.durationFormatted, systemImage: "clock")
                        Label("\(session.totalWorkSets) sets", systemImage: "checkmark.circle")
                    }
                    .font(.caption)
                    .foregroundStyle(.secondary)
                }
            }
            Spacer()
        }
    }
}

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
                .fill(.ultraThinMaterial)
                .shadow(color: .black.opacity(0.3), radius: 8)
        }
        .padding(.horizontal, 32)
    }
}
