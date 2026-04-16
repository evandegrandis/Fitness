import Foundation
import ActivityKit

/// App-side facade for the workout Live Activity.
///
/// Only the main app can start/end an activity — the widget extension is pure
/// presentation. The controller keeps a reference to the current activity
/// so `update(...)` can fan changes to the lock-screen / Dynamic Island.
@MainActor
final class LiveActivityController {
    static let shared = LiveActivityController()

    private var currentActivity: Activity<WorkoutActivityAttributes>?

    private init() {}

    // MARK: - Lifecycle

    /// Start a new Live Activity for the given workout session. Safe to call
    /// even if one is already running — we end the previous activity first so
    /// the user never sees two overlapping activities on the lock screen.
    func start(
        workoutID: UUID,
        exerciseName: String,
        workoutStartedAt: Date,
        nextExerciseName: String = "",
        nextSetPreview: String = ""
    ) {
        let authInfo = ActivityAuthorizationInfo()
        guard authInfo.areActivitiesEnabled else {
            print("[LiveActivity] Activities NOT enabled — user needs to allow in Settings > Jeera > Live Activities")
            return
        }

        Task {
            await endCurrentActivityIfNeeded()

            let attributes = WorkoutActivityAttributes(
                workoutID: workoutID,
                title: "Entraînement"
            )
            let state = WorkoutContentState(
                exerciseName: exerciseName,
                lastSetSummary: "",
                restEndsAt: nil,
                restTotalSeconds: 0,
                workoutStartedAt: workoutStartedAt,
                nextExerciseName: nextExerciseName,
                nextSetPreview: nextSetPreview
            )

            do {
                let content = ActivityContent(state: state, staleDate: nil)
                let activity = try Activity.request(
                    attributes: attributes,
                    content: content,
                    pushType: nil
                )
                currentActivity = activity
                print("[LiveActivity] Started: \(activity.id)")
            } catch {
                print("[LiveActivity] Start FAILED: \(error)")
            }
        }
    }

    /// Push a new state snapshot. Called after every set log, rest start, and
    /// rest skip. Cheap no-op if no activity is running.
    func update(state: WorkoutContentState) {
        guard let activity = currentActivity else { return }

        Task {
            let content = ActivityContent(state: state, staleDate: nil)
            await activity.update(content)
        }
    }

    /// End the activity. Called on finish/discard. Uses `.immediate` so the
    /// activity disappears from the lock screen right away — no 4-hour ghost.
    func end() {
        Task { await endCurrentActivityIfNeeded() }
    }

    private func endCurrentActivityIfNeeded() async {
        guard let activity = currentActivity else { return }
        await activity.end(nil, dismissalPolicy: .immediate)
        currentActivity = nil
    }
}
