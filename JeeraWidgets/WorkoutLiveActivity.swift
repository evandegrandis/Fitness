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
                .padding(12)
                .activityBackgroundTint(Color.black.opacity(0.85))
                .activitySystemActionForegroundColor(.white)
        } dynamicIsland: { context in
            DynamicIsland {
                DynamicIslandExpandedRegion(.leading) {
                    VStack(alignment: .leading, spacing: 2) {
                        Text(context.state.exerciseName)
                            .font(.subheadline.weight(.semibold))
                            .lineLimit(1)
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
        VStack(alignment: .leading, spacing: 8) {
            HStack(alignment: .center, spacing: 8) {
                HStack(spacing: 8) {
                    Image(systemName: "dumbbell.fill")
                        .font(.caption.weight(.bold))
                        .foregroundStyle(Color.accentColor)
                    Text(state.exerciseName)
                        .font(.caption.weight(.bold))
                        .lineLimit(1)
                        .minimumScaleFactor(0.8)
                }

                Spacer()
                Text(timerInterval: state.workoutStartedAt...Date.distantFuture,
                     countsDown: false, showsHours: false)
                    .font(.caption2.weight(.bold).monospacedDigit())
                    .foregroundStyle(.secondary)
            }

            VStack(alignment: .leading, spacing: 7) {
                HStack(spacing: 7) {
                    compactRestBadge

                    Text(primaryPreviewLine)
                        .font(.caption.weight(.semibold).monospacedDigit())
                        .foregroundStyle(.white.opacity(0.94))
                        .lineLimit(1)
                        .minimumScaleFactor(0.76)
                }

                if !secondaryPreviewLine.isEmpty {
                    Text(secondaryPreviewLine)
                        .font(.caption2.weight(.medium))
                        .foregroundStyle(.secondary)
                        .lineLimit(1)
                        .padding(.leading, 2)
                }
            }

            if #available(iOS 17.0, *), !state.nextSetPreview.isEmpty {
                HStack(spacing: 6) {
                    primaryActionButton("Valider", intent: ValidateNextSetIntent(), emphasis: 1.4)
                        .frame(maxWidth: .infinity)

                    secondaryActionButton("Suiv.", intent: NextExerciseIntent())
                        .frame(width: 70)
                }

                HStack(spacing: 6) {
                    nudgeButton("-kg", intent: DecreaseWeightIntent())
                    nudgeButton("+kg", intent: IncreaseWeightIntent())
                    nudgeButton("-rep", intent: DecreaseRepsIntent())
                    nudgeButton("+rep", intent: IncreaseRepsIntent())
                }
                .frame(maxWidth: .infinity)
            } else if #available(iOS 17.0, *), !state.nextExerciseName.isEmpty {
                secondaryActionButton("Suiv.", intent: NextExerciseIntent())
                    .frame(width: 84)
            }
        }
    }

    private var primaryPreviewLine: String {
        if !state.nextSetPreview.isEmpty {
            return state.nextSetPreview
        }
        if !state.nextExerciseName.isEmpty {
            return state.nextExerciseName
        }
        return "Prêt"
    }

    private var secondaryPreviewLine: String {
        if !state.nextSetPreview.isEmpty, !state.nextExerciseName.isEmpty {
            return state.nextExerciseName
        }
        return ""
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
            VStack(spacing: 6) {
                HStack(alignment: .center, spacing: 10) {
                    VStack(alignment: .leading, spacing: 2) {
                        Text(state.nextSetPreview)
                            .font(.subheadline.weight(.bold).monospacedDigit())
                            .lineLimit(1)
                        if !state.nextExerciseName.isEmpty {
                            Text(state.nextExerciseName)
                                .font(.caption2)
                                .foregroundStyle(.secondary)
                                .lineLimit(1)
                        }
                    }
                    Spacer()
                    RestOrReadyBadge(state: state)
                }

                if #available(iOS 17.0, *) {
                    HStack(spacing: 6) {
                        primaryActionButton("Valider", intent: ValidateNextSetIntent(), emphasis: 1.35)
                        secondaryActionButton("Suiv.", intent: NextExerciseIntent())
                            .frame(width: 72)
                    }

                    HStack(spacing: 6) {
                        nudgeButton("-kg", intent: DecreaseWeightIntent())
                        nudgeButton("+kg", intent: IncreaseWeightIntent())
                        nudgeButton("-r", intent: DecreaseRepsIntent())
                        nudgeButton("+r", intent: IncreaseRepsIntent())
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
            .font(.system(size: 10, weight: .bold, design: .rounded))
            .frame(maxWidth: .infinity)
            .padding(.horizontal, 5)
            .padding(.vertical, 6)
            .background(.white.opacity(0.10))
            .foregroundStyle(.white)
            .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
    }
    .buttonStyle(.plain)
}

@available(iOS 17.0, *)
private func primaryActionButton<I: LiveActivityIntent>(_ title: String, intent: I, emphasis: CGFloat = 1.0) -> some View {
    Button(intent: intent) {
        Text(title)
            .font(.system(size: 13, weight: .bold, design: .rounded))
            .lineLimit(1)
            .minimumScaleFactor(0.72)
            .frame(maxWidth: .infinity)
            .padding(.horizontal, 9)
            .padding(.vertical, 9)
            .background(Color.accentColor, in: RoundedRectangle(cornerRadius: 16, style: .continuous))
            .foregroundStyle(.white)
    }
    .buttonStyle(.plain)
    .layoutPriority(emphasis)
}

@available(iOS 17.0, *)
private func secondaryActionButton<I: LiveActivityIntent>(_ title: String, intent: I) -> some View {
    Button(intent: intent) {
        Text(title)
            .font(.system(size: 13, weight: .bold, design: .rounded))
            .lineLimit(1)
            .minimumScaleFactor(0.72)
            .frame(maxWidth: .infinity)
            .padding(.horizontal, 8)
            .padding(.vertical, 9)
            .background(.white.opacity(0.10), in: RoundedRectangle(cornerRadius: 16, style: .continuous))
            .foregroundStyle(.white)
    }
    .buttonStyle(.plain)
}

private extension LockScreenView {
    @ViewBuilder
    var compactRestBadge: some View {
        if let endsAt = state.restEndsAt, endsAt > Date() {
            HStack(spacing: 8) {
                Image(systemName: "timer")
                    .font(.caption.weight(.bold))
                    .foregroundStyle(Color.accentColor)
                Text(timerInterval: Date()...endsAt, countsDown: true, showsHours: false)
                    .font(.system(size: 15, weight: .heavy, design: .rounded).monospacedDigit())
                    .foregroundStyle(Color.accentColor)
            }
            .padding(.horizontal, 8)
            .padding(.vertical, 5)
            .background(Color.accentColor.opacity(0.10), in: Capsule())
        } else {
            HStack(spacing: 8) {
                Circle()
                    .fill(.green)
                    .frame(width: 9, height: 9)
                Text("GO")
                    .font(.system(size: 11, weight: .bold, design: .rounded))
                    .foregroundStyle(.green)
            }
            .padding(.horizontal, 8)
            .padding(.vertical, 5)
            .background(.green.opacity(0.10), in: Capsule())
        }
    }
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
