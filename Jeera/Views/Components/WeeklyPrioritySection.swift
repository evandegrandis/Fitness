import SwiftUI
import SwiftData

/// Titled horizontally-scrolling strip of rolling 7-day priority chips.
///
/// Showcases parent muscles where remaining > 0 in descending order of how much
/// work is left. Numbers update live during an active workout because the caller
/// passes the `liveSession` into `EffectiveSetsEngine.rollingPriorities`.
struct WeeklyPrioritySection: View {
    @Query(
        filter: #Predicate<WorkoutSession> { !$0.isActive },
        sort: \WorkoutSession.startTime,
        order: .reverse
    ) private var finishedSessions: [WorkoutSession]
    @Query private var goals: [MuscleGoal]

    /// Currently active session (if any) — added live to the rolling totals so
    /// chips decrease the moment a set is validated.
    var liveSession: WorkoutSession?

    /// Optional headline override. Defaults to "À prioriser (7 jours)".
    var title: String = "À prioriser (7 jours)"

    @State private var chips: [(MuscleParent, Int)] = []

    /// Hash of every goal's parent + value so `.task(id:)` re-fires when the
    /// user edits any goal in Settings, not only when a goal row is inserted.
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
                VStack(alignment: .leading, spacing: 10) {
                    Text(title)
                        .font(.caption.weight(.semibold))
                        .foregroundStyle(.secondary)
                        .padding(.horizontal, 20)

                    ScrollView(.horizontal, showsIndicators: false) {
                        HStack(spacing: 8) {
                            ForEach(chips, id: \.0) { parent, remaining in
                                PriorityChip(
                                    label: parent.shortName,
                                    remaining: remaining
                                )
                            }
                        }
                        .padding(.horizontal, 20)
                    }
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
                .font(.caption2.weight(.medium))
                .foregroundStyle(.primary)
                .lineLimit(1)
                .fixedSize()

            Text("\(remaining)")
                .font(.caption2.weight(.heavy).monospacedDigit())
                .foregroundStyle(accent)
        }
        .padding(.horizontal, 10)
        .padding(.vertical, 7)
        .background {
            Capsule()
                .fill(Color.white.opacity(0.08))
        }
        .overlay {
            Capsule()
                .stroke(accent.opacity(0.25), lineWidth: 0.6)
        }
    }
}
