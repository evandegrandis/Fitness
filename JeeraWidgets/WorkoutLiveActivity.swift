import ActivityKit
import WidgetKit
import SwiftUI

/// Lock-screen + Dynamic Island presentation for the active workout.
/// All data flows from the shared `WorkoutActivityAttributes` + `WorkoutContentState`
/// (defined in `JeeraShared/WorkoutActivityAttributes.swift`). The widget owns
/// zero state of its own — everything ticks via `Text(timerInterval:)`.
struct WorkoutLiveActivity: Widget {
    var body: some WidgetConfiguration {
        ActivityConfiguration(for: WorkoutActivityAttributes.self) { context in
            LockScreenView(state: context.state)
                .padding(14)
                .activityBackgroundTint(Color.black.opacity(0.85))
                .activitySystemActionForegroundColor(.white)
        } dynamicIsland: { context in
            DynamicIsland {
                DynamicIslandExpandedRegion(.leading) {
                    VStack(alignment: .leading, spacing: 2) {
                        Text("Jeera")
                            .font(.caption2.weight(.semibold))
                            .foregroundStyle(.secondary)
                        Text(context.state.exerciseName)
                            .font(.headline)
                            .lineLimit(1)
                    }
                }
                DynamicIslandExpandedRegion(.trailing) {
                    VStack(alignment: .trailing, spacing: 2) {
                        Text("Sets")
                            .font(.caption2.weight(.semibold))
                            .foregroundStyle(.secondary)
                        Text("\(context.state.totalSets)")
                            .font(.title3.weight(.bold).monospacedDigit())
                    }
                }
                DynamicIslandExpandedRegion(.bottom) {
                    CenterContent(state: context.state, compact: false)
                }
            } compactLeading: {
                Image(systemName: "dumbbell.fill")
                    .foregroundStyle(Color.accentColor)
            } compactTrailing: {
                CompactTrailing(state: context.state)
            } minimal: {
                Image(systemName: "dumbbell.fill")
                    .foregroundStyle(Color.accentColor)
            }
            .keylineTint(Color.accentColor)
        }
    }
}

// MARK: - Lock Screen

private struct LockScreenView: View {
    let state: WorkoutContentState

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(alignment: .firstTextBaseline) {
                Image(systemName: "dumbbell.fill")
                    .font(.caption)
                    .foregroundStyle(Color.accentColor)
                Text(state.exerciseName)
                    .font(.subheadline.weight(.semibold))
                    .lineLimit(1)
                Spacer()
                Text(timerInterval: state.workoutStartedAt...Date.distantFuture,
                     countsDown: false,
                     showsHours: false)
                    .font(.caption.weight(.semibold).monospacedDigit())
                    .foregroundStyle(.secondary)
                    .frame(maxWidth: 60, alignment: .trailing)
            }

            if !state.lastSetSummary.isEmpty {
                Text(state.lastSetSummary)
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }

            HStack {
                CenterContent(state: state, compact: true)
                Spacer()
                VStack(alignment: .trailing, spacing: 1) {
                    Text("\(state.totalSets)")
                        .font(.title2.weight(.bold).monospacedDigit())
                    Text("sets")
                        .font(.caption2)
                        .foregroundStyle(.secondary)
                }
            }
        }
    }
}

// MARK: - Rest Timer / Status Line

/// Shows the rest timer (if running) or a "Go!" label. Kept as a single view so
/// the expanded Dynamic Island + lock screen share exactly one presentation.
private struct CenterContent: View {
    let state: WorkoutContentState
    let compact: Bool

    var body: some View {
        if let endsAt = state.restEndsAt, endsAt > Date() {
            HStack(spacing: 8) {
                Image(systemName: "timer")
                    .font(.caption)
                    .foregroundStyle(Color.accentColor)
                Text(timerInterval: Date()...endsAt, countsDown: true, showsHours: false)
                    .font((compact ? .title3 : .title2).weight(.bold).monospacedDigit())
                    .foregroundStyle(Color.accentColor)
                    .frame(minWidth: 56, alignment: .leading)
                Text("repos")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
        } else {
            HStack(spacing: 6) {
                Image(systemName: "figure.strengthtraining.traditional")
                    .font(.caption)
                    .foregroundStyle(.green)
                Text("En cours")
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(.green)
            }
        }
    }
}

// MARK: - Dynamic Island compact trailing

private struct CompactTrailing: View {
    let state: WorkoutContentState

    var body: some View {
        if let endsAt = state.restEndsAt, endsAt > Date() {
            Text(timerInterval: Date()...endsAt, countsDown: true, showsHours: false)
                .font(.caption.weight(.bold).monospacedDigit())
                .foregroundStyle(Color.accentColor)
                .frame(maxWidth: 44)
        } else {
            Text("\(state.totalSets)")
                .font(.caption.weight(.bold).monospacedDigit())
                .foregroundStyle(.primary)
        }
    }
}
