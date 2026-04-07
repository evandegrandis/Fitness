import Foundation
import SwiftData

struct SeedData {
    static func seed(context: ModelContext) {
        // Settings
        let settings = UserSettings()
        context.insert(settings)

        // Exercises
        let exercises = createExercises(context: context)

        // Goals
        createGoals(context: context)

        // Templates
        createTemplates(context: context, exercises: exercises)

        // Sample History
        createSampleHistory(context: context, exercises: exercises)

        try? context.save()
    }

    // MARK: - Exercises

    static func createExercises(context: ModelContext) -> [String: Exercise] {
        var map: [String: Exercise] = [:]

        func make(
            _ name: String,
            category: String,
            mode: SetPatternMode = .straight,
            repMin: Int = 8,
            repMax: Int = 12,
            increment: Double = 2.5,
            favorite: Bool = false,
            muscles: [(MuscleGroup, Double)]
        ) {
            let ex = Exercise(
                name: name,
                category: category,
                setPatternMode: mode,
                repTargetMin: repMin,
                repTargetMax: repMax,
                smallestIncrement: increment,
                isFavorite: favorite
            )
            context.insert(ex)

            for (muscle, coeff) in muscles {
                let m = MuscleMapping(muscleGroup: muscle, coefficient: coeff)
                m.exercise = ex
                context.insert(m)
                ex.muscleMappings.append(m)
            }

            map[name] = ex
        }

        // Pull
        make("Neutral-Grip Pull-Up", category: "Pull", mode: .bodyweight, repMin: 6, repMax: 12, favorite: true,
             muscles: [(.lats, 1.0), (.upperback, 0.3), (.biceps, 0.3), (.forearms, 0.1)])

        make("Weighted Neutral-Grip Pull-Up", category: "Pull", mode: .weightedBodyweight, repMin: 5, repMax: 8, increment: 2.5, favorite: true,
             muscles: [(.lats, 1.0), (.upperback, 0.3), (.biceps, 0.3), (.forearms, 0.1)])

        make("Close-Grip Pulldown", category: "Pull", mode: .straight, repMin: 8, repMax: 12,
             muscles: [(.lats, 1.0), (.biceps, 0.3), (.forearms, 0.1)])

        make("Wide Pulldown", category: "Pull", mode: .straight, repMin: 8, repMax: 12,
             muscles: [(.lats, 1.0), (.upperback, 0.3), (.biceps, 0.1)])

        make("Cable Row", category: "Pull", mode: .straight, repMin: 8, repMax: 12, increment: 5,
             muscles: [(.upperback, 1.0), (.lats, 0.3), (.biceps, 0.3)])

        make("Chest-Supported Row", category: "Pull", mode: .topSetBackoff, repMin: 8, repMax: 10, increment: 2.5,
             muscles: [(.upperback, 1.0), (.lats, 0.3), (.biceps, 0.3), (.reardelts, 0.1)])

        // Push
        make("Chest Press", category: "Push", mode: .topSetBackoff, repMin: 6, repMax: 10, increment: 2.5, favorite: true,
             muscles: [(.chest, 1.0), (.triceps, 0.3), (.frontdelts, 0.3)])

        make("Shoulder Press", category: "Push", mode: .straight, repMin: 6, repMax: 10, increment: 2.5, favorite: true,
             muscles: [(.shoulders, 1.0), (.triceps, 0.3)])

        make("HSPU", category: "Push", mode: .bodyweight, repMin: 3, repMax: 8,
             muscles: [(.shoulders, 1.0), (.triceps, 0.3)])

        make("Machine Dips", category: "Push", mode: .straight, repMin: 8, repMax: 12, increment: 5,
             muscles: [(.chest, 0.3), (.triceps, 1.0), (.frontdelts, 0.1)])

        make("Pec Deck", category: "Push", mode: .straight, repMin: 10, repMax: 15, increment: 5,
             muscles: [(.chest, 1.0), (.frontdelts, 0.1)])

        // Arms
        make("Standing Curl", category: "Arms", mode: .straight, repMin: 8, repMax: 12, increment: 1.0,
             muscles: [(.biceps, 1.0), (.forearms, 0.3)])

        make("Incline Curl", category: "Arms", mode: .straight, repMin: 8, repMax: 12, increment: 1.0,
             muscles: [(.biceps, 1.0), (.forearms, 0.1)])

        make("Triceps Extension", category: "Arms", mode: .straight, repMin: 10, repMax: 15, increment: 2.5,
             muscles: [(.triceps, 1.0)])

        make("Wrist Curl", category: "Arms", mode: .straight, repMin: 12, repMax: 20, increment: 1.0,
             muscles: [(.forearms, 1.0)])

        // Shoulders
        make("Lateral Raise", category: "Arms", mode: .straight, repMin: 12, repMax: 18, increment: 1.0,
             muscles: [(.sidedelts, 1.0)])

        // Legs
        make("Leg Extension", category: "Legs", mode: .ramping, repMin: 10, repMax: 15, increment: 5,
             muscles: [(.quads, 1.0)])

        make("Leg Curl", category: "Legs", mode: .straight, repMin: 10, repMax: 15, increment: 5,
             muscles: [(.hamstrings, 1.0)])

        // Core
        make("Decline Crunch Weighted", category: "Core", mode: .straight, repMin: 12, repMax: 20, increment: 2.5, favorite: true,
             muscles: [(.abs, 1.0)])

        return map
    }

    // MARK: - Goals

    static func createGoals(context: ModelContext) {
        let goals: [(MuscleGroup, Double)] = [
            (.chest, 12),
            (.shoulders, 10),
            (.sidedelts, 8),
            (.frontdelts, 6),
            (.reardelts, 6),
            (.triceps, 10),
            (.biceps, 10),
            (.forearms, 6),
            (.lats, 12),
            (.upperback, 10),
            (.quads, 10),
            (.hamstrings, 8),
            (.abs, 8),
        ]

        for (muscle, sets) in goals {
            let goal = MuscleGoal(muscleGroup: muscle, weeklyGoalSets: sets)
            context.insert(goal)
        }
    }

    // MARK: - Templates

    static func createTemplates(context: ModelContext, exercises: [String: Exercise]) {
        func template(_ name: String, _ names: [String]) {
            let t = WorkoutTemplate(name: name)
            context.insert(t)
            for (i, exName) in names.enumerated() {
                if let ex = exercises[exName] {
                    let te = TemplateExercise(orderIndex: i, exercise: ex, targetSets: 3)
                    context.insert(te)
                    t.templateExercises.append(te)
                }
            }
        }

        template("Upper Pull", [
            "Weighted Neutral-Grip Pull-Up",
            "Close-Grip Pulldown",
            "Cable Row",
            "Standing Curl",
            "Incline Curl",
            "Wrist Curl"
        ])

        template("Upper Push", [
            "Chest Press",
            "Shoulder Press",
            "Machine Dips",
            "Pec Deck",
            "Lateral Raise",
            "Triceps Extension"
        ])

        template("Legs + Core", [
            "Leg Extension",
            "Leg Curl",
            "Decline Crunch Weighted"
        ])
    }

    // MARK: - Sample History

    static func createSampleHistory(context: ModelContext, exercises: [String: Exercise]) {
        let calendar = Calendar.current
        let now = Date()

        // Generate 4 weeks of messy history
        for weekOffset in 1...4 {
            guard let weekBase = calendar.date(byAdding: .weekOfYear, value: -weekOffset, to: now) else { continue }

            // Session 1: Upper Pull day
            if let day1 = calendar.date(byAdding: .day, value: 0, to: weekBase) {
                let session = WorkoutSession(
                    date: day1,
                    startTime: day1,
                    endTime: calendar.date(byAdding: .hour, value: 1, to: day1),
                    isActive: false
                )
                context.insert(session)

                // Pull-ups with messy performance
                if let ex = exercises["Neutral-Grip Pull-Up"] {
                    let logged = LoggedExercise(orderIndex: 0, exercise: ex)
                    logged.session = session
                    context.insert(logged)
                    session.loggedExercises.append(logged)

                    let reps = [12 - weekOffset, 10 - weekOffset, max(6, 8 - weekOffset)]
                    for (i, r) in reps.enumerated() {
                        let s = LoggedSet(weight: 0, reps: r, setType: .work, timestamp: day1, setSlotIndex: i)
                        s.loggedExercise = logged
                        context.insert(s)
                        logged.sets.append(s)
                    }
                }

                // Weighted pull-ups: top set + backoff
                if let ex = exercises["Weighted Neutral-Grip Pull-Up"] {
                    let logged = LoggedExercise(orderIndex: 1, exercise: ex)
                    logged.session = session
                    context.insert(logged)
                    session.loggedExercises.append(logged)

                    let topWeight = 15.0 + Double(4 - weekOffset) * 2.5
                    let sets: [(Double, Int, SetType)] = [
                        (topWeight, 6, .topSet),
                        (topWeight - 5, 8, .backoff),
                        (topWeight - 5, max(5, 7 - weekOffset % 2), .backoff),
                    ]
                    for (i, (w, r, t)) in sets.enumerated() {
                        let s = LoggedSet(weight: w, reps: r, setType: t, timestamp: day1, setSlotIndex: i)
                        s.loggedExercise = logged
                        context.insert(s)
                        logged.sets.append(s)
                    }
                }

                // Close grip pulldown
                if let ex = exercises["Close-Grip Pulldown"] {
                    let logged = LoggedExercise(orderIndex: 2, exercise: ex)
                    logged.session = session
                    context.insert(logged)
                    session.loggedExercises.append(logged)

                    let w = 55.0 + Double(4 - weekOffset) * 2.5
                    let reps = [12, 10, max(7, 9 - weekOffset % 3)]
                    for (i, r) in reps.enumerated() {
                        let s = LoggedSet(weight: w, reps: r, setType: .work, timestamp: day1, setSlotIndex: i)
                        s.loggedExercise = logged
                        context.insert(s)
                        logged.sets.append(s)
                    }
                }

                // Curls
                if let ex = exercises["Standing Curl"] {
                    let logged = LoggedExercise(orderIndex: 3, exercise: ex)
                    logged.session = session
                    context.insert(logged)
                    session.loggedExercises.append(logged)

                    let w = 12.0 + Double(4 - weekOffset)
                    let reps = [12, 10, max(6, 8 - weekOffset % 2)]
                    for (i, r) in reps.enumerated() {
                        let s = LoggedSet(weight: w, reps: r, setType: .work, timestamp: day1, setSlotIndex: i)
                        s.loggedExercise = logged
                        context.insert(s)
                        logged.sets.append(s)
                    }
                }
            }

            // Session 2: Upper Push day
            if let day2 = calendar.date(byAdding: .day, value: 2, to: weekBase) {
                let session = WorkoutSession(
                    date: day2,
                    startTime: day2,
                    endTime: calendar.date(byAdding: .minute, value: 75, to: day2),
                    isActive: false
                )
                context.insert(session)

                // Chest Press: top set + backoff with messy perf
                if let ex = exercises["Chest Press"] {
                    let logged = LoggedExercise(orderIndex: 0, exercise: ex)
                    logged.session = session
                    context.insert(logged)
                    session.loggedExercises.append(logged)

                    let topWeight = 80.0 + Double(4 - weekOffset) * 2.5
                    let sets: [(Double, Int, SetType)] = [
                        (topWeight, max(5, 7 - weekOffset % 2), .topSet),
                        (topWeight - 10, 8, .backoff),
                        (topWeight - 10, max(5, 7 - weekOffset), .backoff),
                    ]
                    for (i, (w, r, t)) in sets.enumerated() {
                        let s = LoggedSet(weight: w, reps: r, setType: t, timestamp: day2, setSlotIndex: i)
                        s.loggedExercise = logged
                        context.insert(s)
                        logged.sets.append(s)
                    }
                }

                // Shoulder Press: straight sets with fatigue
                if let ex = exercises["Shoulder Press"] {
                    let logged = LoggedExercise(orderIndex: 1, exercise: ex)
                    logged.session = session
                    context.insert(logged)
                    session.loggedExercises.append(logged)

                    let w = 40.0 + Double(4 - weekOffset) * 2.5
                    let reps = [10, max(6, 8 - weekOffset % 2), max(5, 7 - weekOffset)]
                    for (i, r) in reps.enumerated() {
                        let s = LoggedSet(weight: w, reps: r, setType: .work, timestamp: day2, setSlotIndex: i)
                        s.loggedExercise = logged
                        context.insert(s)
                        logged.sets.append(s)
                    }
                }

                // Pec Deck: fatigue-driven rep decline
                if let ex = exercises["Pec Deck"] {
                    let logged = LoggedExercise(orderIndex: 2, exercise: ex)
                    logged.session = session
                    context.insert(logged)
                    session.loggedExercises.append(logged)

                    let w = 50.0 + Double(4 - weekOffset) * 5
                    let reps = [15, 12, max(8, 10 - weekOffset)]
                    for (i, r) in reps.enumerated() {
                        let s = LoggedSet(weight: w, reps: r, setType: .work, timestamp: day2, setSlotIndex: i)
                        s.loggedExercise = logged
                        context.insert(s)
                        logged.sets.append(s)
                    }
                }

                // Lateral Raises
                if let ex = exercises["Lateral Raise"] {
                    let logged = LoggedExercise(orderIndex: 3, exercise: ex)
                    logged.session = session
                    context.insert(logged)
                    session.loggedExercises.append(logged)

                    let w = 8.0 + Double(4 - weekOffset)
                    let reps = [15, 14, max(10, 12 - weekOffset)]
                    for (i, r) in reps.enumerated() {
                        let s = LoggedSet(weight: w, reps: r, setType: .work, timestamp: day2, setSlotIndex: i)
                        s.loggedExercise = logged
                        context.insert(s)
                        logged.sets.append(s)
                    }
                }

                // Triceps
                if let ex = exercises["Triceps Extension"] {
                    let logged = LoggedExercise(orderIndex: 4, exercise: ex)
                    logged.session = session
                    context.insert(logged)
                    session.loggedExercises.append(logged)

                    let w = 25.0 + Double(4 - weekOffset) * 2.5
                    let reps = [15, 12, max(8, 10 - weekOffset)]
                    for (i, r) in reps.enumerated() {
                        let s = LoggedSet(weight: w, reps: r, setType: .work, timestamp: day2, setSlotIndex: i)
                        s.loggedExercise = logged
                        context.insert(s)
                        logged.sets.append(s)
                    }
                }
            }

            // Session 3: Legs + Core (shorter, sometimes incomplete)
            if let day3 = calendar.date(byAdding: .day, value: 4, to: weekBase) {
                let session = WorkoutSession(
                    date: day3,
                    startTime: day3,
                    endTime: calendar.date(byAdding: .minute, value: weekOffset == 2 ? 30 : 55, to: day3),
                    isActive: false
                )
                context.insert(session)

                // Leg Extension: ramping
                if let ex = exercises["Leg Extension"] {
                    let logged = LoggedExercise(orderIndex: 0, exercise: ex)
                    logged.session = session
                    context.insert(logged)
                    session.loggedExercises.append(logged)

                    let baseWeight = 40.0 + Double(4 - weekOffset) * 5
                    let sets: [(Double, Int)] = [
                        (baseWeight, 15),
                        (baseWeight + 10, 12),
                        (baseWeight + 20, max(8, 10 - weekOffset)),
                    ]
                    for (i, (w, r)) in sets.enumerated() {
                        let s = LoggedSet(weight: w, reps: r, setType: .work, timestamp: day3, setSlotIndex: i)
                        s.loggedExercise = logged
                        context.insert(s)
                        logged.sets.append(s)
                    }
                }

                // Leg Curl
                if let ex = exercises["Leg Curl"] {
                    let logged = LoggedExercise(orderIndex: 1, exercise: ex)
                    logged.session = session
                    context.insert(logged)
                    session.loggedExercises.append(logged)

                    let w = 35.0 + Double(4 - weekOffset) * 5
                    // Week 2 is incomplete session - only 2 sets
                    let repsList: [Int] = weekOffset == 2 ? [12, 10] : [15, 12, max(8, 10 - weekOffset)]
                    for (i, r) in repsList.enumerated() {
                        let s = LoggedSet(weight: w, reps: r, setType: .work, timestamp: day3, setSlotIndex: i)
                        s.loggedExercise = logged
                        context.insert(s)
                        logged.sets.append(s)
                    }
                }

                // Crunches
                if let ex = exercises["Decline Crunch Weighted"] {
                    let logged = LoggedExercise(orderIndex: 2, exercise: ex)
                    logged.session = session
                    context.insert(logged)
                    session.loggedExercises.append(logged)

                    let w = 10.0 + Double(4 - weekOffset) * 2.5
                    let reps = [20, 18, max(12, 15 - weekOffset)]
                    for (i, r) in reps.enumerated() {
                        let s = LoggedSet(weight: w, reps: r, setType: .work, timestamp: day3, setSlotIndex: i)
                        s.loggedExercise = logged
                        context.insert(s)
                        logged.sets.append(s)
                    }
                }
            }
        }
    }
}
