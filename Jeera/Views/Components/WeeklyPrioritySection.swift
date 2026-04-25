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

    @State private var chips: [(MuscleParent, Int)] = []

    private var goalFingerprint: Int {
        var hasher = Hasher()
        for g in goals {
            hasher.combine(g.parent)
            hasher.combine(g.weeklyGoalSets)
        }
        hasher.combine(finishedSessions.count)
        if let liveSession {
            hasher.combine(liveSession.loggedExercises.reduce(0) { $0 + $1.completedWorkSets.count })
        }
        return hasher.finalize()
    }

    var body: some View {
        Group {
            if !chips.isEmpty {
                LazyVGrid(
                    columns: Array(
                        repeating: GridItem(.flexible(minimum: 0), spacing: style == .activeWorkout ? 8 : 6),
                        count: style == .activeWorkout ? 3 : 4
                    ),
                    alignment: .leading,
                    spacing: style == .activeWorkout ? 8 : 6
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
                .padding(.top, style == .activeWorkout ? 4 : 2)
            }
        }
        .task(id: goalFingerprint) {
            chips = EffectiveSetsEngine.rolling7DayProgress(
                sessions: finishedSessions,
                goals: goals,
                liveSession: liveSession
            )
            .sorted {
                if abs($0.remaining - $1.remaining) > 0.01 {
                    return $0.remaining > $1.remaining
                }
                return $0.parent.displayName < $1.parent.displayName
            }
            .map { ($0.parent, Int($0.remaining.rounded(.up))) }
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
                .font(.system(size: style == .activeWorkout ? 11 : 10, weight: .semibold, design: .rounded))
                .foregroundStyle(remaining == 0 ? .secondary : .primary)
                .lineLimit(style == .activeWorkout ? 2 : 1)
                .minimumScaleFactor(0.75)

            HStack(spacing: 4) {
                Text("\(remaining)")
                    .font(.system(size: style == .activeWorkout ? 12 : 10, weight: .heavy, design: .rounded).monospacedDigit())
                    .foregroundStyle(accent)
                if style == .activeWorkout {
                    Text("restants")
                        .font(.system(size: 9, weight: .medium, design: .rounded))
                        .foregroundStyle(.secondary)
                }
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.horizontal, style == .activeWorkout ? 10 : 8)
        .padding(.vertical, style == .activeWorkout ? 8 : 6)
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
