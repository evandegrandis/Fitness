import SwiftUI
import SwiftData

/// Compact all-groups overview for rolling 7-day remaining sets.
struct WeeklyPrioritySection: View {
    enum DisplayStyle {
        case compact
        case activeWorkout
    }

    @Query(
        filter: #Predicate<WorkoutSession> { !$0.isActive },
        sort: \WorkoutSession.startTime,
        order: .reverse
    ) private var finishedSessions: [WorkoutSession]
    @Query private var goals: [MuscleGoal]

    var liveSession: WorkoutSession?
    var style: DisplayStyle = .compact

    private var chips: [(MuscleParent, Int)] {
        let progress = EffectiveSetsEngine.rolling7DayProgress(
            sessions: finishedSessions,
            goals: goals,
            liveSession: liveSession
        )

        switch style {
        case .compact:
            return progress
                .filter { $0.goalSets > 0 && $0.remaining >= 0.5 }
                .sorted { $0.remaining > $1.remaining }
                .map { ($0.parent, Int($0.remaining.rounded(.up))) }

        case .activeWorkout:
            return progress
                .filter { $0.goalSets > 0 }
                .sorted {
                    if abs($0.remaining - $1.remaining) > 0.01 {
                        return $0.remaining > $1.remaining
                    }
                    return $0.parent.displayName < $1.parent.displayName
                }
                .map { ($0.parent, max(0, Int($0.remaining.rounded(.up)))) }
        }
    }

    var body: some View {
        Group {
            if chips.isEmpty {
                if style == .activeWorkout {
                    compactCompletionState
                }
            } else {
                Group {
                    if style == .activeWorkout {
                        ScrollView(.horizontal, showsIndicators: false) {
                            HStack(spacing: 6) {
                                Text("7j")
                                    .font(.system(size: 10, weight: .bold, design: .rounded))
                                    .foregroundStyle(.tertiary)
                                    .padding(.horizontal, 2)

                                ForEach(chips, id: \.0) { parent, remaining in
                                    PriorityChip(
                                        label: parent.shortName,
                                        remaining: remaining,
                                        style: style
                                    )
                                }
                            }
                            .padding(.horizontal, 16)
                        }
                        .padding(.vertical, 2)
                    } else {
                        VStack(alignment: .leading, spacing: 4) {
                            LazyVGrid(
                                columns: Array(
                                    repeating: GridItem(.flexible(minimum: 0), spacing: 6),
                                    count: 4
                                ),
                                alignment: .leading,
                                spacing: 6
                            ) {
                                ForEach(chips, id: \.0) { parent, remaining in
                                    PriorityChip(
                                        label: parent.shortName,
                                        remaining: remaining,
                                        style: style
                                    )
                                }
                            }
                            .padding(.horizontal, 16)
                        }
                    }
                }
                .padding(.top, style == .activeWorkout ? 0 : 2)
            }
        }
    }

    private var compactCompletionState: some View {
        HStack(spacing: 6) {
            Text("7j")
                .font(.system(size: 10, weight: .bold, design: .rounded))
                .foregroundStyle(.tertiary)
            Image(systemName: "checkmark.circle.fill")
                .font(.caption2)
                .foregroundStyle(.green)
            Text("couvert")
                .font(.system(size: 11, weight: .semibold, design: .rounded))
                .foregroundStyle(.secondary)
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 4)
    }
}

private struct PriorityChip: View {
    let label: String
    let remaining: Int
    let style: WeeklyPrioritySection.DisplayStyle

    private var accent: Color {
        if remaining == 0 { return .green }
        if remaining >= 10 { return .red }
        if remaining >= 5 { return .orange }
        return Color.accentColor
    }

    var body: some View {
        Group {
            if style == .activeWorkout {
                HStack(spacing: 5) {
                    Text(label)
                        .font(.system(size: 10, weight: .semibold, design: .rounded))
                        .foregroundStyle(remaining == 0 ? .secondary : .primary)
                        .lineLimit(1)
                    Text("\(remaining)")
                        .font(.system(size: 11, weight: .heavy, design: .rounded).monospacedDigit())
                        .foregroundStyle(accent)
                }
                .padding(.horizontal, 9)
                .padding(.vertical, 6)
            } else {
                VStack(alignment: .leading, spacing: 1) {
                    Text(label)
                        .font(.system(size: 10, weight: .semibold, design: .rounded))
                        .foregroundStyle(remaining == 0 ? .secondary : .primary)
                        .lineLimit(1)
                        .minimumScaleFactor(0.75)

                    Text("\(remaining)")
                        .font(.system(size: 10, weight: .heavy, design: .rounded).monospacedDigit())
                        .foregroundStyle(accent)
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(.horizontal, 8)
                .padding(.vertical, 6)
            }
        }
        .background {
            RoundedRectangle(cornerRadius: style == .activeWorkout ? 999 : 12, style: .continuous)
                .fill(Color.white.opacity(0.06))
        }
        .overlay {
            RoundedRectangle(cornerRadius: style == .activeWorkout ? 999 : 12, style: .continuous)
                .stroke(accent.opacity(0.25), lineWidth: 0.6)
        }
    }
}
