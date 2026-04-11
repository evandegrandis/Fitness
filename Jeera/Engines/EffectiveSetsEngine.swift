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

// MARK: - Smart Pacing Status

enum PaceStatus: String {
    case complete       // Goal met
    case wellOnTrack    // Clearly ahead
    case onTrack        // Normal for this point in week
    case toPrioritize   // Slightly low, worth focusing
    case low            // Meaningfully behind

    var frenchLabel: String {
        switch self {
        case .complete: return "Couvert"
        case .wellOnTrack: return "Bien avancé"
        case .onTrack: return "Dans les clous"
        case .toPrioritize: return "À prioriser"
        case .low: return "Encore bas"
        }
    }

    var color: String {
        switch self {
        case .complete: return "green"
        case .wellOnTrack: return "green"
        case .onTrack: return "blue"
        case .toPrioritize: return "orange"
        case .low: return "red"
        }
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

    /// Total effective sets for every muscle group in the given week.
    /// If `liveSession` is provided (the currently active workout), its in-progress
    /// completed sets are counted live so the weekly priority strip decreases the moment
    /// a set is validated — not after the workout is saved.
    static func weeklyTotals(
        sessions: [WorkoutSession],
        weekStart: Date,
        weekEnd: Date,
        liveSession: WorkoutSession? = nil
    ) -> [MuscleGroup: Double] {
        let sessionsInWeek = sessions.filter { session in
            !session.isActive && session.date >= weekStart && session.date < weekEnd
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

        // Live overlay — only count if the active session's date falls inside this week.
        if let live = liveSession, live.date >= weekStart, live.date < weekEnd {
            for loggedEx in live.loggedExercises {
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
        referenceDate: Date = Date(),
        liveSession: WorkoutSession? = nil
    ) -> [MuscleGroupProgress] {
        let weekStart = referenceDate.startOfWeek
        let weekEnd = Calendar.current.date(byAdding: .day, value: 7, to: weekStart) ?? referenceDate

        let prevWeekStart = Calendar.current.date(byAdding: .day, value: -7, to: weekStart) ?? weekStart

        let currentTotals = weeklyTotals(
            sessions: sessions,
            weekStart: weekStart,
            weekEnd: weekEnd,
            liveSession: liveSession
        )
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

    // MARK: - Smart Pacing

    /// Compute pace status considering day of week and typical 3x/week training pattern
    static func paceStatus(for progress: MuscleGroupProgress) -> PaceStatus {
        guard progress.goalSets > 0 else { return .onTrack }
        if progress.effectiveSets >= progress.goalSets { return .complete }

        let dayIndex = Date().isoDayOfWeek // Mon=1 ... Sun=7

        // Expected pace for a 3x/week lifter:
        // Mon (day 1): ~0% expected (haven't trained yet)
        // Tue-Wed: ~33% (after 1 session)
        // Thu-Fri: ~66% (after 2 sessions)
        // Sat-Sun: ~100% (after 3 sessions)
        let expectedPace: Double
        switch dayIndex {
        case 1: expectedPace = 0     // Monday: fresh week
        case 2: expectedPace = 0.15  // Tuesday
        case 3: expectedPace = 0.33  // Wednesday
        case 4: expectedPace = 0.45  // Thursday
        case 5: expectedPace = 0.60  // Friday
        case 6: expectedPace = 0.80  // Saturday
        case 7: expectedPace = 0.90  // Sunday
        default: expectedPace = 0.5
        }

        let actualPace = progress.effectiveSets / progress.goalSets

        if actualPace >= expectedPace + 0.15 { return .wellOnTrack }
        if actualPace >= expectedPace - 0.10 { return .onTrack }
        if actualPace >= expectedPace - 0.30 { return .toPrioritize }
        return .low
    }

    // MARK: - Weekly Status Line (French, contextual)

    static func weeklyStatusLine(
        progress: [MuscleGroupProgress],
        sessions: [WorkoutSession]
    ) -> String {
        let dayIndex = Date().isoDayOfWeek
        let weekStart = Date().startOfWeek
        let weekEnd = Calendar.current.date(byAdding: .day, value: 7, to: weekStart) ?? Date()

        let sessionsThisWeek = sessions.filter { !$0.isActive && $0.date >= weekStart && $0.date < weekEnd }.count

        // Remaining useful sessions estimate (user trains ~3x/week)
        let remainingSessions = max(0, 3 - sessionsThisWeek)

        let withGoals = progress.filter { $0.goalSets > 0 }
        let behind = withGoals.filter { paceStatus(for: $0) == .toPrioritize || paceStatus(for: $0) == .low }
        let complete = withGoals.filter { $0.isComplete }

        // Early week (Mon-Wed): be encouraging
        if dayIndex <= 3 {
            if sessionsThisWeek == 0 {
                return "\(remainingSessions) séances utiles cette semaine"
            }
            if behind.isEmpty {
                return "Bon début de semaine — \(remainingSessions) séances restantes"
            }
            let names = behind.prefix(2).map { $0.muscleGroup.displayName }.joined(separator: " et ")
            return "\(names) à prioriser — \(remainingSessions) séances restantes"
        }

        // Mid week (Thu-Fri)
        if dayIndex <= 5 {
            if complete.count == withGoals.count {
                return "Tous les objectifs atteints cette semaine"
            }
            if behind.isEmpty {
                return "Volume dans les clous — \(remainingSessions) séance\(remainingSessions > 1 ? "s" : "") restante\(remainingSessions > 1 ? "s" : "")"
            }
            let names = behind.prefix(3).map { $0.muscleGroup.displayName }.joined(separator: ", ")
            return "Focus \(names)"
        }

        // Late week (Sat-Sun)
        if complete.count == withGoals.count {
            return "Semaine complète — tous les objectifs atteints"
        }
        if behind.count <= 2 {
            let names = behind.map { $0.muscleGroup.displayName }.joined(separator: " et ")
            return "\(names) encore un peu bas pour cette semaine"
        }
        return "\(remainingSessions) séance\(remainingSessions > 1 ? "s" : "") pour finir la semaine"
    }

    // MARK: - Muscles to prioritize (for recommendations)

    static func musclesToPrioritize(
        progress: [MuscleGroupProgress],
        recentSession: WorkoutSession?
    ) -> [MuscleGroup] {
        // Muscles with goals that are behind
        let behind = progress
            .filter { $0.goalSets > 0 && !$0.isComplete }
            .sorted { $0.remaining > $1.remaining }
            .map(\.muscleGroup)

        // Remove muscles heavily trained in most recent session (recovery)
        guard let recent = recentSession else { return behind }
        let recentMuscles = Set(recent.loggedExercises.compactMap { $0.exercise?.primaryMuscle })

        // Only filter if recent session was today or yesterday
        let isRecent = Calendar.current.isDateInToday(recent.date) || Calendar.current.isDateInYesterday(recent.date)
        if isRecent {
            let filtered = behind.filter { !recentMuscles.contains($0) }
            return filtered.isEmpty ? behind : filtered
        }

        return behind
    }

    // MARK: - Historical weekly data

    static func weeklyHistory(
        sessions: [WorkoutSession],
        goals: [MuscleGoal],
        weeks: Int = 8,
        referenceDate: Date = Date()
    ) -> [WeeklyMuscleData] {
        let currentWeekStart = referenceDate.startOfWeek

        let goalMap = Dictionary(goals.map { ($0.muscleGroup, $0.weeklyGoalSets) }, uniquingKeysWith: { _, last in last })

        var result: [WeeklyMuscleData] = []

        for weekOffset in (0..<weeks).reversed() {
            guard let weekStart = Calendar.current.date(byAdding: .day, value: -weekOffset * 7, to: currentWeekStart) else { continue }
            let weekEnd = Calendar.current.date(byAdding: .day, value: 7, to: weekStart) ?? weekStart

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
