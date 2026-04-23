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
            HStack(spacing: 10) {
                HStack(spacing: 8) {
                    Image(systemName: "dumbbell.fill")
                        .font(.caption.weight(.bold))
                        .foregroundStyle(Color.accentColor)
                    Text(state.exerciseName)
                        .font(.headline.weight(.semibold))
                        .lineLimit(1)
                        .minimumScaleFactor(0.72)
                }

                Spacer(minLength: 8)

                Text(timerInterval: state.workoutStartedAt...Date.distantFuture,
                     countsDown: false, showsHours: false)
                    .font(.callout.weight(.bold).monospacedDigit())
                    .foregroundStyle(.secondary)
                    .padding(.horizontal, 12)
                    .padding(.vertical, 8)
                    .frame(minWidth: 82, alignment: .leading)
                    .background(.white.opacity(0.06), in: Capsule())
            }

            VStack(alignment: .leading, spacing: 8) {
                HStack(spacing: 8) {
                    compactRestBadge

                    if !state.nextExerciseName.isEmpty {
                        Text(state.nextExerciseName)
                            .font(.caption.weight(.semibold))
                            .foregroundStyle(.secondary)
                            .lineLimit(1)
                    }
                }

                if !state.nextSetPreview.isEmpty {
                    Text(state.nextSetPreview)
                        .font(.system(size: 30, weight: .heavy, design: .rounded).monospacedDigit())
                        .lineLimit(1)
                        .minimumScaleFactor(0.75)
                } else if !state.lastSetSummary.isEmpty {
                    Text(state.lastSetSummary)
                        .font(.caption)
                        .foregroundStyle(.secondary)
                        .lineLimit(2)
                }

                if #available(iOS 17.0, *), !state.nextSetPreview.isEmpty {
                    VStack(spacing: 8) {
                        HStack(spacing: 6) {
                            nudgeButton("Kg-", intent: DecreaseWeightIntent())
                            nudgeButton("Kg+", intent: IncreaseWeightIntent())
                            nudgeButton("R-", intent: DecreaseRepsIntent())
                            nudgeButton("R+", intent: IncreaseRepsIntent())
                        }

                        HStack(spacing: 8) {
                            actionButton("Suiv.", fill: .white.opacity(0.10), intent: NextExerciseIntent())
                            actionButton("Valider", fill: Color.accentColor, intent: ValidateNextSetIntent())
                        }
                    }
                }
            }
        }
    }

    @ViewBuilder
    private var compactRestBadge: some View {
        if let endsAt = state.restEndsAt, endsAt > Date() {
            HStack(spacing: 8) {
                Image(systemName: "timer")
                    .font(.caption.weight(.bold))
                    .foregroundStyle(Color.accentColor)
                Text(timerInterval: Date()...endsAt, countsDown: true, showsHours: false)
                    .font(.system(size: 18, weight: .heavy, design: .rounded).monospacedDigit())
                    .foregroundStyle(Color.accentColor)
            }
            .padding(.horizontal, 10)
            .padding(.vertical, 7)
            .background(Color.accentColor.opacity(0.10), in: Capsule())
        } else {
            HStack(spacing: 8) {
                Circle()
                    .fill(.green)
                    .frame(width: 9, height: 9)
                Text("GO")
                    .font(.system(size: 14, weight: .bold, design: .rounded))
                    .foregroundStyle(.green)
            }
            .padding(.horizontal, 10)
            .padding(.vertical, 7)
            .background(.green.opacity(0.10), in: Capsule())
        }
    }
}

// MARK: - Dynamic Island helpers

/// Shows countdown badge or "GO" in expanded DI trailing region.
private struct RestOrReadyBadge: View {
    let state: WorkoutContentState

    var body: some View {
        if let endsAt = state.restEndsAt, endsAt > Date() {
            VStack(alignment: .trailing, spacing: 3) {
                Text(timerInterval: Date()...endsAt, countsDown: true, showsHours: false)
                    .font(.title3.weight(.heavy).monospacedDigit())
                    .foregroundStyle(Color.accentColor)
                Text("Repos")
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
            VStack(spacing: 8) {
                HStack(alignment: .center, spacing: 10) {
                    VStack(alignment: .leading, spacing: 2) {
                        Text(state.nextExerciseName)
                            .font(.caption2)
                            .foregroundStyle(.secondary)
                            .lineLimit(1)
                        Text(state.nextSetPreview)
                            .font(.headline.weight(.bold).monospacedDigit())
                            .lineLimit(1)
                    }
                    Spacer()
                    RestOrReadyBadge(state: state)
                }

                if #available(iOS 17.0, *) {
                    VStack(spacing: 6) {
                        HStack(spacing: 6) {
                            nudgeButton("Kg-", intent: DecreaseWeightIntent())
                            nudgeButton("Kg+", intent: IncreaseWeightIntent())
                            nudgeButton("R-", intent: DecreaseRepsIntent())
                            nudgeButton("R+", intent: IncreaseRepsIntent())
                        }
                        HStack(spacing: 8) {
                            actionButton("Suiv.", fill: .white.opacity(0.10), intent: NextExerciseIntent())
                            actionButton("Valider", fill: Color.accentColor, intent: ValidateNextSetIntent())
                        }
                    }
                }
            }
        }
    }
}

@available(iOS 17.0, *)
private func nudgeButton<I: LiveActivityIntent>(_ title: String, intent: I) -> some View {
    Button(intent: intent) {
        Text(title)
            .font(.system(size: 12, weight: .bold, design: .rounded))
            .frame(maxWidth: .infinity)
            .padding(.horizontal, 6)
            .padding(.vertical, 9)
            .background(.white.opacity(0.10))
            .foregroundStyle(.white)
            .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
    }
    .buttonStyle(.plain)
}

@available(iOS 17.0, *)
private func actionButton<I: LiveActivityIntent>(_ title: String, fill: some ShapeStyle, intent: I) -> some View {
    Button(intent: intent) {
        Text(title)
            .font(.system(size: 15, weight: .bold, design: .rounded))
            .lineLimit(1)
            .minimumScaleFactor(0.72)
            .frame(maxWidth: .infinity)
            .padding(.horizontal, 12)
            .padding(.vertical, 11)
            .background(fill, in: RoundedRectangle(cornerRadius: 16, style: .continuous))
            .foregroundStyle(.white)
    }
    .buttonStyle(.plain)
}

// MARK: - Compact trailing

private struct CompactTrailing: View {
    let state: WorkoutContentState

    var body: some View {
        if let endsAt = state.restEndsAt, endsAt > Date() {
            Text(timerInterval: Date()...endsAt, countsDown: true, showsHours: false)
                .font(.caption.weight(.heavy).monospacedDigit())
                .foregroundStyle(Color.accentColor)
                .frame(maxWidth: 44)
        } else {
            Text("GO")
                .font(.caption.weight(.heavy))
                .foregroundStyle(.green)
        }
    }
}
