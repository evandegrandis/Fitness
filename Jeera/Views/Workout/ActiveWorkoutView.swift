import SwiftUI
import SwiftData

struct ActiveWorkoutView: View {
    @Bindable var viewModel: WorkoutViewModel
    @State private var showFinishAlert = false
    @State private var showExercisePicker = false
    @State private var draggedExercise: LoggedExercise?

    var body: some View {
        ZStack(alignment: .bottom) {
            ScrollView {
                VStack(spacing: 12) {
                    // Workout Header with live timer
                    WorkoutHeaderView(
                        session: viewModel.activeSession,
                        elapsedFormatted: viewModel.workoutElapsedFormatted,
                        totalSets: viewModel.activeSession?.totalWorkSets ?? 0
                    )
                    .padding(.horizontal)

                    // Muscle deficit banner (what you still need this week)
                    if let session = viewModel.activeSession {
                        WeeklyGapBanner(session: session)
                            .padding(.horizontal)
                    }

                    // Exercise Cards with drag reorder
                    if let session = viewModel.activeSession {
                        ForEach(session.orderedExercises) { loggedExercise in
                            ExerciseCard(
                                loggedExercise: loggedExercise,
                                viewModel: viewModel
                            )
                            .padding(.horizontal)
                            .transition(.asymmetric(
                                insertion: .scale(scale: 0.95).combined(with: .opacity),
                                removal: .opacity
                            ))
                            .onDrag {
                                draggedExercise = loggedExercise
                                return NSItemProvider(object: loggedExercise.id.uuidString as NSString)
                            }
                            .onDrop(of: [.text], delegate: ExerciseDropDelegate(
                                item: loggedExercise,
                                viewModel: viewModel,
                                draggedItem: $draggedExercise
                            ))
                        }
                    }

                    // Spacer for floating button clearance
                    Spacer(minLength: 140)
                }
                .padding(.top, 4)
            }

            // Floating Add Exercise button
            VStack(spacing: 0) {
                Spacer()

                HStack {
                    Spacer()

                    Button {
                        showExercisePicker = true
                        HapticManager.tap()
                    } label: {
                        Image(systemName: "plus")
                            .font(.title2.weight(.semibold))
                            .foregroundStyle(.white)
                            .frame(width: 56, height: 56)
                            .background(Color.accentColor, in: Circle())
                            .shadow(color: Color.accentColor.opacity(0.4), radius: 12, y: 4)
                    }
                    .buttonStyle(.plain)
                    .padding(.trailing, 20)
                    .padding(.bottom, viewModel.restTimer.isRunning ? 90 : 12)
                }
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
}

// MARK: - Drag & Drop Delegate

struct ExerciseDropDelegate: DropDelegate {
    let item: LoggedExercise
    let viewModel: WorkoutViewModel
    @Binding var draggedItem: LoggedExercise?

    func performDrop(info: DropInfo) -> Bool {
        draggedItem = nil
        return true
    }

    func dropEntered(info: DropInfo) {
        guard let dragged = draggedItem,
              dragged.id != item.id,
              let session = viewModel.activeSession else { return }

        let exercises = session.orderedExercises
        guard let fromIndex = exercises.firstIndex(where: { $0.id == dragged.id }),
              let toIndex = exercises.firstIndex(where: { $0.id == item.id }) else { return }

        withAnimation(.spring(response: 0.3)) {
            viewModel.moveExercise(
                from: IndexSet(integer: fromIndex),
                to: toIndex > fromIndex ? toIndex + 1 : toIndex
            )
        }
    }

    func dropUpdated(info: DropInfo) -> DropProposal? {
        DropProposal(operation: .move)
    }
}

// MARK: - Workout Header (compact, live timer)

struct WorkoutHeaderView: View {
    let session: WorkoutSession?
    var elapsedFormatted: String = "--"
    var totalSets: Int = 0

    var body: some View {
        HStack {
            VStack(alignment: .leading, spacing: 2) {
                Text("Séance")
                    .font(.title3.weight(.bold))
                HStack(spacing: 10) {
                    Label(elapsedFormatted, systemImage: "clock")
                    Label("\(totalSets) sets", systemImage: "checkmark.circle")
                }
                .font(.caption2)
                .foregroundStyle(.secondary)
            }
            Spacer()
        }
    }
}

// MARK: - Weekly Gap Banner

struct WeeklyGapBanner: View {
    let session: WorkoutSession
    @Query private var allSessions: [WorkoutSession]
    @Query private var goals: [MuscleGoal]

    private var gaps: [(MuscleGroup, Double)] {
        let progress = EffectiveSetsEngine.currentWeekProgress(sessions: allSessions, goals: goals)
        return progress
            .filter { $0.remaining > 1 && $0.goalSets > 0 }
            .sorted { $0.remaining > $1.remaining }
            .prefix(4)
            .map { ($0.muscleGroup, $0.remaining) }
    }

    var body: some View {
        if !gaps.isEmpty {
            HStack(spacing: 8) {
                Image(systemName: "target")
                    .font(.caption2)
                    .foregroundStyle(.orange)

                HStack(spacing: 6) {
                    ForEach(gaps, id: \.0) { muscle, remaining in
                        HStack(spacing: 2) {
                            Text(muscle.displayName)
                                .font(.caption2.weight(.medium))
                            Text("\(Int(remaining))")
                                .font(.caption2.weight(.bold).monospacedDigit())
                                .foregroundStyle(.orange)
                        }
                    }
                }

                Spacer()

                Text("restant")
                    .font(.caption2)
                    .foregroundStyle(.tertiary)
            }
            .padding(.horizontal, 12)
            .padding(.vertical, 8)
            .background {
                RoundedRectangle(cornerRadius: 10, style: .continuous)
                    .fill(.orange.opacity(0.08))
                    .overlay {
                        RoundedRectangle(cornerRadius: 10, style: .continuous)
                            .stroke(.orange.opacity(0.15), lineWidth: 0.5)
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
                .fill(.ultraThinMaterial)
                .shadow(color: .black.opacity(0.3), radius: 8)
        }
        .padding(.horizontal, 32)
    }
}
