import Foundation
import ActivityKit

/// App-side facade for the workout Live Activity.
///
/// Only the main app can start/end an activity — the widget extension is pure
/// presentation. The controller keeps a weak reference to the current activity
/// so `update(...)` can fan changes out to the lock-screen/Dynamic Island.
///
/// All ActivityKit calls are wrapped in availability checks because the app's
/// deployment target (17.0) straddles the Live Activity API and we don't want
/// the app to crash on a device that somehow has activities disabled.
@MainActor
final class LiveActivityController {
    static let shared = LiveActivityController()

    private var currentActivity: Activity<WorkoutActivityAttributes>?

    private init() {}

    /// True when the user has Live Activities enabled AND we're on a supported
    /// iOS version. Use this to gate any call into the controller.
    var isAvailable: Bool {
        if #available(iOS 16.2, *) {
            return ActivityAuthorizationInfo().areActivitiesEnabled
        }
        return false
    }

    // MARK: - Lifecycle

    /// Start a new Live Activity for the given workout session. Safe to call
    /// even if one is already running — we end the previous activity first so
    /// the user never sees two overlapping activities on the lock screen.
    func start(
        workoutID: UUID,
        exerciseName: String,
        workoutStartedAt: Date,
        totalSets: Int
    ) {
        guard isAvailable else { return }

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
                totalSets: totalSets
            )

            do {
                if #available(iOS 16.2, *) {
                    let content = ActivityContent(state: state, staleDate: nil)
                    let activity = try Activity.request(
                        attributes: attributes,
                        content: content,
                        pushType: nil
                    )
                    currentActivity = activity
                }
            } catch {
                // Silent: Live Activities are a nice-to-have, never block the workout.
                print("LiveActivity start failed: \(error)")
            }
        }
    }

    /// Push a new state snapshot to the activity. Called after every set log,
    /// rest start, and rest skip. Cheap no-op if no activity is running.
    func update(
        exerciseName: String,
        lastSetSummary: String,
        restEndsAt: Date?,
        restTotalSeconds: Int,
        workoutStartedAt: Date,
        totalSets: Int
    ) {
        guard isAvailable, let activity = currentActivity else { return }

        let state = WorkoutContentState(
            exerciseName: exerciseName,
            lastSetSummary: lastSetSummary,
            restEndsAt: restEndsAt,
            restTotalSeconds: restTotalSeconds,
            workoutStartedAt: workoutStartedAt,
            totalSets: totalSets
        )

        Task {
            if #available(iOS 16.2, *) {
                let content = ActivityContent(state: state, staleDate: nil)
                await activity.update(content)
            }
        }
    }

    /// Clear the rest-timer portion of the state without otherwise disturbing
    /// the activity. Used by the "skip rest" intent.
    func clearRest(exerciseName: String, lastSetSummary: String, workoutStartedAt: Date, totalSets: Int) {
        update(
            exerciseName: exerciseName,
            lastSetSummary: lastSetSummary,
            restEndsAt: nil,
            restTotalSeconds: 0,
            workoutStartedAt: workoutStartedAt,
            totalSets: totalSets
        )
    }

    /// End the activity. Called on finish/discard. Uses `.immediate` so the
    /// activity disappears from the lock screen right away — no 4-hour ghost.
    func end() {
        Task { await endCurrentActivityIfNeeded() }
    }

    private func endCurrentActivityIfNeeded() async {
        guard let activity = currentActivity else { return }
        if #available(iOS 16.2, *) {
            await activity.end(nil, dismissalPolicy: .immediate)
        }
        currentActivity = nil
    }
}
