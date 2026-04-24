import SwiftUI
import SwiftData

/// Compact horizontally-scrolling strip of rolling 7-day priority chips.
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
        return hasher.finalize()
    }

    var body: some View {
        Group {
            if !chips.isEmpty {
                ScrollView(.horizontal, showsIndicators: false) {
                    HStack(spacing: 6) {
                        ForEach(chips, id: \.0) { parent, remaining in
                            PriorityChip(
                                label: parent.shortName,
                                remaining: remaining
                            )
                        }
                    }
                    .padding(.horizontal, 16)
                }
            }
        }
        .task(id: goalFingerprint) {
            chips = EffectiveSetsEngine.rollingPriorities(
                sessions: finishedSessions,
                goals: goals,
                liveSession: liveSession
            )
            .map { ($0.0, Int($0.1.rounded())) }
        }
    }
}

private struct PriorityChip: View {
    let label: String
    let remaining: Int

    private var accent: Color {
        if remaining >= 10 { return .red }
        if remaining >= 5 { return .orange }
        return Color.accentColor
    }

    var body: some View {
        HStack(spacing: 6) {
            Text(label)
                .font(.system(size: 11, weight: .medium, design: .rounded))
                .foregroundStyle(.primary)
                .lineLimit(1)
                .fixedSize()

            Text("\(remaining)")
                .font(.system(size: 11, weight: .heavy, design: .rounded).monospacedDigit())
                .foregroundStyle(accent)
        }
        .padding(.horizontal, 8)
        .padding(.vertical, 5)
        .background {
            Capsule()
                .fill(Color.white.opacity(0.07))
        }
        .overlay {
            Capsule()
                .stroke(accent.opacity(0.25), lineWidth: 0.6)
        }
    }
}
