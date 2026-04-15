import ActivityKit
import Foundation

/// Live Activity attributes shared between the app target and the widget extension.
/// Values that never change during the workout go on the attributes struct itself;
/// values that tick with the session live on `ContentState`.
///
/// Kept deliberately small — Live Activity payloads are capped at 4 KB by iOS and
/// updates larger than ~1 KB throttle aggressively on the lock screen.
struct WorkoutActivityAttributes: ActivityAttributes {
    public typealias ContentState = WorkoutContentState

    /// Stable identifier for the active workout session. Mirrors
    /// `WorkoutSession.id` so we never confuse two back-to-back sessions.
    var workoutID: UUID

    /// Localized workout label ("Entraînement"). Kept as an attribute because it
    /// never changes mid-session.
    var title: String
}

/// Mutable payload. `ActivityKit` diffs this to decide when to redraw.
struct WorkoutContentState: Codable, Hashable {
    /// Name of the exercise the user is currently on (or most recently logged).
    var exerciseName: String

    /// Short summary of the last validated set ("80 kg × 8"). Empty string when
    /// no set has been logged yet.
    var lastSetSummary: String

    /// Absolute wall-clock time at which the current rest period should end.
    /// Nil while the user is actively working (no rest running). We use an end
    /// date rather than a remaining duration so `Text(timerInterval:)` can tick
    /// down live without any push updates.
    var restEndsAt: Date?

    /// Total seconds the current rest was scheduled for (used for the progress
    /// bar proportion). 0 when no rest is running.
    var restTotalSeconds: Int

    /// When the workout started. Used by the lock-screen elapsed-time label.
    var workoutStartedAt: Date

    /// Count of completed work sets across the whole session. Drives the big
    /// "Sets: N" badge on the lock screen + Dynamic Island expanded view.
    var totalSets: Int
}
