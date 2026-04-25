import SwiftUI
import SwiftData

/// Compact all-groups overview for rolling 7-day remaining sets.
struct WeeklyPrioritySection: View {
    @Query(
        filter: #Predicate<WorkoutSession> { !$0.isActive },
        sort: \WorkoutSession.startTime,
        order: .reverse
    ) private var finishedSessions: [WorkoutSession]
    @Query private var goals: [MuscleGoal]

    var liveSession: WorkoutSession?

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
                    columns: Array(repeating: GridItem(.flexible(minimum: 0), spacing: 6), count: 4),
                    alignment: .leading,
                    spacing: 6
                ) {
                    ForEach(chips, id: \.0) { parent, remaining in
                        PriorityChip(
                            label: parent.shortName,
                            remaining: remaining
                        )
                    }
                }
                .padding(.horizontal, 16)
                .padding(.top, 2)
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

    private var accent: Color {
        if remaining == 0 { return .green }
        if remaining >= 10 { return .red }
        if remaining >= 5 { return .orange }
        return Color.accentColor
    }

    var body: some View {
        HStack(spacing: 4) {
            Text(label)
                .font(.system(size: 10, weight: .semibold, design: .rounded))
                .foregroundStyle(remaining == 0 ? .secondary : .primary)
                .lineLimit(1)
                .minimumScaleFactor(0.75)

            Spacer(minLength: 0)

            Text("\(remaining)")
                .font(.system(size: 10, weight: .heavy, design: .rounded).monospacedDigit())
                .foregroundStyle(accent)
        }
        .padding(.horizontal, 8)
        .padding(.vertical, 6)
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
