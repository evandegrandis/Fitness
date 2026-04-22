import ActivityKit
import WidgetKit
import SwiftUI
import AppIntents

/// Lock-screen + Dynamic Island presentation for the active workout.
/// All data flows from `WorkoutActivityAttributes` + `WorkoutContentState`
/// (JeeraShared). The widget owns zero state — everything ticks via
/// `Text(timerInterval:)` and buttons fire `LiveActivityIntent`s that
/// execute in the app process.
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
                        Text(context.state.exerciseName)
                            .font(.headline)
                            .lineLimit(1)
                        if !context.state.lastSetSummary.isEmpty {
                            Text(context.state.lastSetSummary)
                                .font(.caption2)
                                .foregroundStyle(.secondary)
                        }
                    }
                }
                DynamicIslandExpandedRegion(.trailing) {
                    RestOrReadyBadge(state: context.state)
                }
                DynamicIslandExpandedRegion(.bottom) {
                    NextSetRow(state: context.state)
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
            // Row 1: exercise name + workout elapsed
            HStack(alignment: .firstTextBaseline) {
                Image(systemName: "dumbbell.fill")
                    .font(.caption)
                    .foregroundStyle(Color.accentColor)
                Text(state.exerciseName)
                    .font(.subheadline.weight(.semibold))
                    .lineLimit(1)
                Spacer()
                Text(timerInterval: state.workoutStartedAt...Date.distantFuture,
                     countsDown: false, showsHours: false)
                    .font(.caption.weight(.semibold).monospacedDigit())
                    .foregroundStyle(.secondary)
                    .frame(maxWidth: 60, alignment: .trailing)
            }

            // Row 2: last set done (small context)
            if !state.lastSetSummary.isEmpty {
                Text(state.lastSetSummary)
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }

            // Row 3: rest timer (if running) + next set + action buttons
            HStack(spacing: 12) {
                // Left: timer or "Go"
                if let endsAt = state.restEndsAt, endsAt > Date() {
                    HStack(spacing: 6) {
                        Image(systemName: "timer")
                            .font(.caption)
                            .foregroundStyle(Color.accentColor)
                        Text(timerInterval: Date()...endsAt, countsDown: true, showsHours: false)
                            .font(Font.title3.weight(.bold).monospacedDigit())
                            .foregroundStyle(Color.accentColor)
                    }
                } else {
                    Text("GO")
                        .font(Font.title3.weight(.heavy))
                        .foregroundStyle(.green)
                }

                Spacer()

                // Right: next set preview + Valider button
                if !state.nextSetPreview.isEmpty {
                    VStack(alignment: .trailing, spacing: 2) {
                        Text(state.nextExerciseName)
                            .font(.caption2)
                            .foregroundStyle(.secondary)
                            .lineLimit(1)
                        Text(state.nextSetPreview)
                            .font(.caption.weight(.semibold))
                            .foregroundStyle(.primary)
                    }

                    if #available(iOS 17.0, *) {
                        VStack(alignment: .trailing, spacing: 6) {
                            HStack(spacing: 5) {
                                tinyButton("-kg", intent: DecreaseWeightIntent())
                                tinyButton("+kg", intent: IncreaseWeightIntent())
                                tinyButton("-rep", intent: DecreaseRepsIntent())
                                tinyButton("+rep", intent: IncreaseRepsIntent())
                            }

                            HStack(spacing: 6) {
                                Button(intent: NextExerciseIntent()) {
                                    Text("Suivant")
                                        .font(.caption.weight(.bold))
                                        .padding(.horizontal, 10)
                                        .padding(.vertical, 6)
                                        .background(.white.opacity(0.12))
                                        .foregroundStyle(.white)
                                        .clipShape(Capsule())
                                }
                                .buttonStyle(.plain)
                                Button(intent: ValidateNextSetIntent()) {
                                    Text("Valider")
                                        .font(.caption.weight(.bold))
                                        .padding(.horizontal, 12)
                                        .padding(.vertical, 6)
                                        .background(Color.accentColor)
                                        .foregroundStyle(.white)
                                        .clipShape(Capsule())
                                }
                            }
                            .buttonStyle(.plain)
                        }
                    }
                }
            }
        }
    }
}

// MARK: - Dynamic Island helpers

/// Shows countdown badge or "GO" in expanded DI trailing region.
private struct RestOrReadyBadge: View {
    let state: WorkoutContentState

    var body: some View {
        if let endsAt = state.restEndsAt, endsAt > Date() {
            VStack(alignment: .trailing, spacing: 1) {
                Text(timerInterval: Date()...endsAt, countsDown: true, showsHours: false)
                    .font(.title3.weight(.bold).monospacedDigit())
                    .foregroundStyle(Color.accentColor)
                Text("repos")
                    .font(.caption2)
                    .foregroundStyle(.secondary)
            }
        } else {
            Text("GO")
                .font(.title3.weight(.heavy))
                .foregroundStyle(.green)
        }
    }
}

/// Next set preview in the expanded DI bottom region.
private struct NextSetRow: View {
    let state: WorkoutContentState

    var body: some View {
        if !state.nextSetPreview.isEmpty {
            HStack {
                VStack(alignment: .leading, spacing: 1) {
                    Text("Prochain")
                        .font(.caption2)
                        .foregroundStyle(.secondary)
                    Text("\(state.nextExerciseName) — \(state.nextSetPreview)")
                        .font(.caption.weight(.semibold))
                        .lineLimit(1)
                }
                Spacer()
                if #available(iOS 17.0, *) {
                    VStack(alignment: .trailing, spacing: 4) {
                        HStack(spacing: 4) {
                            tinyButton("-kg", intent: DecreaseWeightIntent())
                            tinyButton("+kg", intent: IncreaseWeightIntent())
                            tinyButton("-r", intent: DecreaseRepsIntent())
                            tinyButton("+r", intent: IncreaseRepsIntent())
                        }
                        HStack(spacing: 6) {
                            Button(intent: NextExerciseIntent()) {
                                Text("Suivant")
                                    .font(.caption2.weight(.bold))
                                    .padding(.horizontal, 10)
                                    .padding(.vertical, 4)
                                    .background(.white.opacity(0.12))
                                    .foregroundStyle(.white)
                                    .clipShape(Capsule())
                            }
                            .buttonStyle(.plain)
                            Button(intent: ValidateNextSetIntent()) {
                                Text("Valider")
                                    .font(.caption2.weight(.bold))
                                    .padding(.horizontal, 10)
                                    .padding(.vertical, 4)
                                    .background(Color.accentColor)
                                    .foregroundStyle(.white)
                                    .clipShape(Capsule())
                            }
                        }
                        .buttonStyle(.plain)
                    }
                }
            }
        }
    }
}

@available(iOS 17.0, *)
private func tinyButton<I: LiveActivityIntent>(_ title: String, intent: I) -> some View {
    Button(intent: intent) {
        Text(title)
            .font(.system(size: 9, weight: .semibold))
            .padding(.horizontal, 6)
            .padding(.vertical, 3)
            .background(.white.opacity(0.10))
            .foregroundStyle(.white)
            .clipShape(Capsule())
    }
    .buttonStyle(.plain)
}

// MARK: - Compact trailing

private struct CompactTrailing: View {
    let state: WorkoutContentState

    var body: some View {
        if let endsAt = state.restEndsAt, endsAt > Date() {
            Text(timerInterval: Date()...endsAt, countsDown: true, showsHours: false)
                .font(.caption.weight(.bold).monospacedDigit())
                .foregroundStyle(Color.accentColor)
                .frame(maxWidth: 44)
        } else {
            Text("GO")
                .font(.caption.weight(.heavy))
                .foregroundStyle(.green)
        }
    }
}
