import SwiftUI
import SwiftData

/// Titled horizontally-scrolling strip of weekly priority chips.
///
/// Showcases muscles where remaining > 0 in descending order of how much work is
/// left. Numbers update live during an active workout because the caller passes
/// the `liveSession` down into `EffectiveSetsEngine.currentWeekProgress`.
///
/// No "restant" caption on the right — the number next to each muscle IS the
/// remaining count, which is unambiguous in the titled block.
struct WeeklyPrioritySection: View {
    @Query(
        filter: #Predicate<WorkoutSession> { !$0.isActive },
        sort: \WorkoutSession.startTime,
        order: .reverse
    ) private var finishedSessions: [WorkoutSession]
    @Query private var goals: [MuscleGoal]

    /// Currently active session (if any) — added live to the weekly totals so
    /// chips decrease the moment a set is validated.
    var liveSession: WorkoutSession?

    /// Optional headline override. Defaults to "À prioriser cette semaine".
    var title: String = "À prioriser cette semaine"

    private var chips: [(MuscleGroup, Int)] {
        let progress = EffectiveSetsEngine.currentWeekProgress(
            sessions: finishedSessions,
            goals: goals,
            liveSession: liveSession
        )
        return progress
            .filter { $0.goalSets > 0 && $0.remaining >= 1 }
            .sorted { $0.remaining > $1.remaining }
            .map { ($0.muscleGroup, Int($0.remaining.rounded())) }
    }

    var body: some View {
        if !chips.isEmpty {
            VStack(alignment: .leading, spacing: 10) {
                Text(title)
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(.secondary)
                    .padding(.horizontal, 20)

                ScrollView(.horizontal, showsIndicators: false) {
                    HStack(spacing: 8) {
                        ForEach(chips, id: \.0) { muscle, remaining in
                            PriorityChip(
                                label: muscle.shortName,
                                remaining: remaining
                            )
                        }
                    }
                    .padding(.horizontal, 20)
                }
            }
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
                .font(.caption.weight(.medium))
                .foregroundStyle(.primary)
                .lineLimit(1)
                .fixedSize()

            Text("\(remaining)")
                .font(.caption.weight(.heavy).monospacedDigit())
                .foregroundStyle(accent)
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 8)
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
