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
                    HStack(spacing: 6) {
                        Image(systemName: "checkmark.circle.fill")
                            .font(.caption2)
                            .foregroundStyle(.green)
                        Text("Objectifs 7j atteints")
                            .font(.system(size: 11, weight: .semibold, design: .rounded))
                            .foregroundStyle(.secondary)
                    }
                    .padding(.horizontal, 16)
                    .padding(.top, 4)
                }
            } else {
                VStack(alignment: .leading, spacing: style == .activeWorkout ? 6 : 4) {
                    if style == .activeWorkout {
                        Text("Reste 7 jours")
                            .font(.system(size: 10, weight: .bold, design: .rounded))
                            .foregroundStyle(.tertiary)
                            .padding(.horizontal, 16)
                    }
                    LazyVGrid(
                        columns: Array(
                            repeating: GridItem(.flexible(minimum: 0), spacing: style == .activeWorkout ? 6 : 6),
                            count: style == .activeWorkout ? 4 : 4
                        ),
                        alignment: .leading,
                        spacing: style == .activeWorkout ? 6 : 6
                    ) {
                        ForEach(chips, id: \.0) { parent, remaining in
                            PriorityChip(
                                label: style == .activeWorkout ? parent.displayName : parent.shortName,
                                remaining: remaining,
                                style: style
                            )
                        }
                    }
                    .padding(.horizontal, 16)
                }
                .padding(.top, style == .activeWorkout ? 4 : 2)
            }
        }
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
        VStack(alignment: .leading, spacing: style == .activeWorkout ? 3 : 1) {
            Text(label)
                .font(.system(size: style == .activeWorkout ? 10 : 10, weight: .semibold, design: .rounded))
                .foregroundStyle(remaining == 0 ? .secondary : .primary)
                .lineLimit(1)
                .minimumScaleFactor(0.75)

            HStack(spacing: 4) {
                Text("\(remaining)")
                    .font(.system(size: style == .activeWorkout ? 11 : 10, weight: .heavy, design: .rounded).monospacedDigit())
                    .foregroundStyle(accent)
                if style == .activeWorkout {
                    Text("r")
                        .font(.system(size: 9, weight: .bold, design: .rounded))
                        .foregroundStyle(.secondary)
                }
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.horizontal, style == .activeWorkout ? 8 : 8)
        .padding(.vertical, style == .activeWorkout ? 7 : 6)
        .background {
            RoundedRectangle(cornerRadius: 12, style: .continuous)
                .fill(Color.white.opacity(0.06))
        }
        .overlay {
            RoundedRectangle(cornerRadius: 12, style: .continuous)
                .stroke(accent.opacity(0.25), lineWidth: 0.6)
        }
    }
}
