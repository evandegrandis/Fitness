import Foundation
import SwiftData

struct MuscleGroupProgress: Identifiable {
    let muscleGroup: MuscleGroup
    let effectiveSets: Double
    let goalSets: Double
    let previousWeekSets: Double

    var id: String { muscleGroup.rawValue }

    var percentage: Double {
        guard goalSets > 0 else { return 0 }
        return min((effectiveSets / goalSets) * 100, 999)
    }

    var remaining: Double {
        max(0, goalSets - effectiveSets)
    }

    var delta: Double {
        effectiveSets - previousWeekSets
    }

    var isComplete: Bool {
        effectiveSets >= goalSets && goalSets > 0
    }
}

struct WeeklyMuscleData: Identifiable {
    let weekStart: Date
    let muscleGroup: MuscleGroup
    let effectiveSets: Double
    let goalSets: Double

    var id: String { "\(muscleGroup.rawValue)-\(weekStart.timeIntervalSince1970)" }

    var percentage: Double {
        guard goalSets > 0 else { return 0 }
        return (effectiveSets / goalSets) * 100
    }
}

struct EffectiveSetsEngine {

    // MARK: - Calculate effective sets for a single logged exercise

    static func effectiveSets(for loggedExercise: LoggedExercise) -> [MuscleGroup: Double] {
        guard let exercise = loggedExercise.exercise else { return [:] }

        let completedWorkSets = loggedExercise.completedWorkSets.count
        var result: [MuscleGroup: Double] = [:]

        for mapping in exercise.muscleMappings {
            result[mapping.muscleGroup] = Double(completedWorkSets) * mapping.coefficient
        }

        return result
    }

    // MARK: - Calculate weekly totals

    static func weeklyTotals(
        sessions: [WorkoutSession],
        weekStart: Date,
        weekEnd: Date
    ) -> [MuscleGroup: Double] {
        let sessionsInWeek = sessions.filter { session in
            session.date >= weekStart && session.date < weekEnd
        }

        var totals: [MuscleGroup: Double] = [:]

        for session in sessionsInWeek {
            for loggedEx in session.loggedExercises {
                let sets = effectiveSets(for: loggedEx)
                for (muscle, value) in sets {
                    totals[muscle, default: 0] += value
                }
            }
        }

        return totals
    }

    // MARK: - Build progress report

    static func currentWeekProgress(
        sessions: [WorkoutSession],
        goals: [MuscleGoal],
        referenceDate: Date = Date()
    ) -> [MuscleGroupProgress] {
        let calendar = Calendar.current
        let weekStart = calendar.dateInterval(of: .weekOfYear, for: referenceDate)?.start ?? referenceDate
        let weekEnd = calendar.date(byAdding: .weekOfYear, value: 1, to: weekStart) ?? referenceDate

        let prevWeekStart = calendar.date(byAdding: .weekOfYear, value: -1, to: weekStart) ?? weekStart

        let currentTotals = weeklyTotals(sessions: sessions, weekStart: weekStart, weekEnd: weekEnd)
        let prevTotals = weeklyTotals(sessions: sessions, weekStart: prevWeekStart, weekEnd: weekStart)

        let goalMap = Dictionary(goals.map { ($0.muscleGroup, $0.weeklyGoalSets) }, uniquingKeysWith: { _, last in last })

        return MuscleGroup.allCases.compactMap { muscle in
            let goal = goalMap[muscle] ?? 0
            let current = currentTotals[muscle] ?? 0
            let previous = prevTotals[muscle] ?? 0

            guard goal > 0 || current > 0 else { return nil }

            return MuscleGroupProgress(
                muscleGroup: muscle,
                effectiveSets: current,
                goalSets: goal,
                previousWeekSets: previous
            )
        }
    }

    // MARK: - Historical weekly data

    static func weeklyHistory(
        sessions: [WorkoutSession],
        goals: [MuscleGoal],
        weeks: Int = 8,
        referenceDate: Date = Date()
    ) -> [WeeklyMuscleData] {
        let calendar = Calendar.current
        let currentWeekStart = calendar.dateInterval(of: .weekOfYear, for: referenceDate)?.start ?? referenceDate

        let goalMap = Dictionary(goals.map { ($0.muscleGroup, $0.weeklyGoalSets) }, uniquingKeysWith: { _, last in last })

        var result: [WeeklyMuscleData] = []

        for weekOffset in (0..<weeks).reversed() {
            guard let weekStart = calendar.date(byAdding: .weekOfYear, value: -weekOffset, to: currentWeekStart),
                  let weekEnd = calendar.date(byAdding: .weekOfYear, value: 1, to: weekStart) else { continue }

            let totals = weeklyTotals(sessions: sessions, weekStart: weekStart, weekEnd: weekEnd)

            for muscle in MuscleGroup.allCases {
                let goal = goalMap[muscle] ?? 0
                let sets = totals[muscle] ?? 0
                if goal > 0 || sets > 0 {
                    result.append(WeeklyMuscleData(
                        weekStart: weekStart,
                        muscleGroup: muscle,
                        effectiveSets: sets,
                        goalSets: goal
                    ))
                }
            }
        }

        return result
    }

    // MARK: - Live impact for a single exercise

    static func liveImpact(
        exercise: Exercise,
        completedSets: Int
    ) -> [MuscleGroup: Double] {
        var result: [MuscleGroup: Double] = [:]
        for mapping in exercise.muscleMappings {
            result[mapping.muscleGroup] = Double(completedSets) * mapping.coefficient
        }
        return result
    }
}
