import Foundation
import SwiftData

// MARK: - Progress aggregate for a parent group

/// Progress for a single parent muscle group computed from a defined window
/// (rolling 7 days or a calendar week). Aggregates all leaf muscles via
/// `Exercise.aggregateCoefficient(for:)` so we never double count a chest-press
/// set toward "Pectoraux".
struct ParentMuscleProgress: Identifiable {
    let parent: MuscleParent
    let effectiveSets: Double
    let goalSets: Double

    var id: String { parent.rawValue }

    var coverage: Double {
        guard goalSets > 0 else { return 0 }
        return min(effectiveSets / goalSets, 1.0)
    }

    var percentDisplay: Int { Int((coverage * 100).rounded()) }

    var remaining: Double { max(0, goalSets - effectiveSets) }

    var status: CoverageStatus {
        if goalSets == 0 { return .covered }
        let c = effectiveSets / goalSets
        if c >= 1.0 { return .covered }
        if c >= 0.7 { return .onTrack }
        if c >= 0.4 { return .toStrengthen }
        return .priority
    }
}

/// Calm, competence-supporting coverage labels. No failure framing.
enum CoverageStatus {
    case covered
    case onTrack
    case toStrengthen
    case priority

    var label: String {
        switch self {
        case .covered:       return "Couvert"
        case .onTrack:       return "En bonne voie"
        case .toStrengthen:  return "À renforcer"
        case .priority:      return "Prioritaire"
        }
    }

    var accent: String {
        switch self {
        case .covered:       return "green"
        case .onTrack:       return "blue"
        case .toStrengthen:  return "orange"
        case .priority:      return "red"
        }
    }
}

// MARK: - Engine

/// Single source of truth for effective-sets aggregation.
///
/// Two windows are supported:
/// - Rolling 7 days → the primary guidance loop (home, priority chips, status).
/// - Calendar week → only used for history browsing, never for decision-making.
struct EffectiveSetsEngine {

    // MARK: - Effective sets for a single logged exercise (by leaf)

    static func leafSets(for loggedExercise: LoggedExercise) -> [MuscleGroup: Double] {
        guard let exercise = loggedExercise.exercise else { return [:] }
        let completed = Double(loggedExercise.completedWorkSets.count)
        guard completed > 0 else { return [:] }
        var result: [MuscleGroup: Double] = [:]
        for mapping in exercise.muscleMappings {
            result[mapping.muscleGroup, default: 0] += completed * mapping.coefficient
        }
        return result
    }

    /// Effective sets aggregated up to the parent level. Each logged
    /// exercise contributes `max(coefficient)` of its leaves per parent so
    /// it never double-counts within the same parent bucket.
    static func parentSets(for loggedExercise: LoggedExercise) -> [MuscleParent: Double] {
        guard let exercise = loggedExercise.exercise else { return [:] }
        let completed = Double(loggedExercise.completedWorkSets.count)
        guard completed > 0 else { return [:] }
        var result: [MuscleParent: Double] = [:]
        for parent in MuscleParent.allCases {
            let coeff = exercise.aggregateCoefficient(for: parent)
            if coeff > 0 {
                result[parent] = completed * coeff
            }
        }
        return result
    }

    // MARK: - Totals

    /// Total effective parent-level sets for sessions that fall strictly inside
    /// [`windowStart`, `windowEnd`). If `liveSession` is provided and its date
    /// falls in range, its in-progress completed sets are counted live.
    static func parentTotals(
        sessions: [WorkoutSession],
        windowStart: Date,
        windowEnd: Date,
        liveSession: WorkoutSession? = nil
    ) -> [MuscleParent: Double] {
        let inRange = sessions.filter { s in
            !s.isActive && s.date >= windowStart && s.date < windowEnd
        }

        var totals: [MuscleParent: Double] = [:]
        for s in inRange {
            for logged in s.loggedExercises {
                for (p, v) in parentSets(for: logged) {
                    totals[p, default: 0] += v
                }
            }
        }
        if let live = liveSession, live.date >= windowStart, live.date < windowEnd {
            for logged in live.loggedExercises {
                for (p, v) in parentSets(for: logged) {
                    totals[p, default: 0] += v
                }
            }
        }
        return totals
    }

    // MARK: - Rolling 7-day progress (PRIMARY guidance loop)

    /// Parent-level coverage over the last 7 days ending at `referenceDate`.
    /// This is the canonical "what should I do today?" model.
    static func rolling7DayProgress(
        sessions: [WorkoutSession],
        goals: [MuscleGoal],
        referenceDate: Date = Date(),
        liveSession: WorkoutSession? = nil
    ) -> [ParentMuscleProgress] {
        let end = Calendar.current.date(byAdding: .day, value: 1, to: referenceDate.startOfDay) ?? referenceDate
        let start = Calendar.current.date(byAdding: .day, value: -7, to: end) ?? referenceDate

        let totals = parentTotals(
            sessions: sessions,
            windowStart: start,
            windowEnd: end,
            liveSession: liveSession
        )

        let goalMap: [MuscleParent: Double] = Dictionary(
            goals.map { ($0.parent, $0.weeklyGoalSets) },
            uniquingKeysWith: { _, last in last }
        )

        return MuscleParent.allCases.compactMap { parent in
            let goal = goalMap[parent] ?? 0
            let current = totals[parent] ?? 0
            guard goal > 0 || current > 0 else { return nil }
            return ParentMuscleProgress(parent: parent, effectiveSets: current, goalSets: goal)
        }
    }

    /// Weighted global coverage score over rolling 7 days.
    /// Weighted average of per-parent coverage (capped at 1.0) across all
    /// parents with a non-zero goal. 0..1.
    static func rolling7DayGlobalCoverage(
        sessions: [WorkoutSession],
        goals: [MuscleGoal],
        referenceDate: Date = Date(),
        liveSession: WorkoutSession? = nil
    ) -> Double {
        let progress = rolling7DayProgress(
            sessions: sessions,
            goals: goals,
            referenceDate: referenceDate,
            liveSession: liveSession
        )
        let withGoals = progress.filter { $0.goalSets > 0 }
        guard !withGoals.isEmpty else { return 0 }
        let totalGoal = withGoals.reduce(0) { $0 + $1.goalSets }
        guard totalGoal > 0 else { return 0 }
        let weighted = withGoals.reduce(0.0) { acc, p in
            acc + min(p.effectiveSets, p.goalSets)
        }
        return weighted / totalGoal
    }

    // MARK: - Calendar-week aggregates (history browsing only)

    /// Coverage for a calendar week (Mon–Sun). Used purely for history
    /// section headers — never to drive decisions.
    static func coverageForWeek(
        sessions: [WorkoutSession],
        goals: [MuscleGoal],
        weekStart: Date
    ) -> Double {
        let weekEnd = Calendar.current.date(byAdding: .day, value: 7, to: weekStart) ?? weekStart
        let totals = parentTotals(sessions: sessions, windowStart: weekStart, windowEnd: weekEnd)
        let goalMap: [MuscleParent: Double] = Dictionary(
            goals.map { ($0.parent, $0.weeklyGoalSets) },
            uniquingKeysWith: { _, last in last }
        )
        let goalParents = goalMap.filter { $0.value > 0 }
        guard !goalParents.isEmpty else { return 0 }
        let totalGoal = goalParents.values.reduce(0, +)
        let weighted = goalParents.reduce(0.0) { acc, kv in
            acc + min(totals[kv.key] ?? 0, kv.value)
        }
        return weighted / totalGoal
    }

    /// Number of parents with non-zero work in this calendar week.
    static func parentsWorkedInWeek(
        sessions: [WorkoutSession],
        weekStart: Date
    ) -> Int {
        let weekEnd = Calendar.current.date(byAdding: .day, value: 7, to: weekStart) ?? weekStart
        let totals = parentTotals(sessions: sessions, windowStart: weekStart, windowEnd: weekEnd)
        return totals.filter { $0.value > 0 }.count
    }

    // MARK: - Status line (rolling 7-day framing)

    static func rollingStatusLine(
        progress: [ParentMuscleProgress],
        sessions: [WorkoutSession],
        referenceDate: Date = Date()
    ) -> String {
        let withGoals = progress.filter { $0.goalSets > 0 }
        guard !withGoals.isEmpty else { return "Pas encore d'objectifs configurés" }

        let totalGoal = withGoals.reduce(0) { $0 + $1.goalSets }
        let covered = withGoals.reduce(0.0) { $0 + min($1.effectiveSets, $1.goalSets) }
        let pct = Int(((covered / totalGoal) * 100).rounded())

        let priorities = withGoals
            .filter { $0.status == .priority || $0.status == .toStrengthen }
            .sorted { $0.remaining > $1.remaining }

        if priorities.isEmpty {
            return "Couverture \(pct)% sur 7 jours — tu es dans ta zone"
        }
        let names = priorities.prefix(2).map { $0.parent.displayName.lowercased() }.joined(separator: " et ")
        if pct >= 70 {
            return "Couverture \(pct)% — focus \(names)"
        }
        return "Couverture \(pct)% sur 7 jours — \(names) à renforcer"
    }

    // MARK: - Priority muscles (for chip strip & recommendation)

    /// Parent muscle priority for the rolling 7-day window, ordered by how
    /// many sets are still missing. Muscles with goals that are fully covered
    /// are excluded.
    static func rollingPriorities(
        sessions: [WorkoutSession],
        goals: [MuscleGoal],
        referenceDate: Date = Date(),
        liveSession: WorkoutSession? = nil
    ) -> [(MuscleParent, Double)] {
        let progress = rolling7DayProgress(
            sessions: sessions,
            goals: goals,
            referenceDate: referenceDate,
            liveSession: liveSession
        )
        return progress
            .filter { $0.goalSets > 0 && $0.remaining >= 0.5 }
            .sorted { $0.remaining > $1.remaining }
            .map { ($0.parent, $0.remaining) }
    }

    // MARK: - Live impact

    /// Parent-level live impact of a single exercise given its completed sets
    /// count. Used by the active workout card's chip strip to show "+1 Pecs".
    static func liveParentImpact(
        exercise: Exercise,
        completedSets: Int
    ) -> [MuscleParent: Double] {
        var result: [MuscleParent: Double] = [:]
        for parent in MuscleParent.allCases {
            let c = exercise.aggregateCoefficient(for: parent)
            if c > 0 {
                result[parent] = Double(completedSets) * c
            }
        }
        return result
    }
}
