import Foundation
import SwiftData

struct SeedData {
    static func seed(context: ModelContext) {
        let settings = UserSettings()
        context.insert(settings)

        let exercises = createExercises(context: context)
        createGoals(context: context)
        createTemplates(context: context, exercises: exercises)
        createRealHistory(context: context, exercises: exercises)

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
            rest: Int = 120,
            favorite: Bool = false,
            machine: String = "",
            notes: String = "",
            muscles: [(MuscleGroup, Double)]
        ) {
            let ex = Exercise(
                name: name,
                category: category,
                setPatternMode: mode,
                repTargetMin: repMin,
                repTargetMax: repMax,
                smallestIncrement: increment,
                isFavorite: favorite,
                suggestedRestSeconds: rest,
                machineSetting: machine,
                setupNotes: notes
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

        // ========== PULL ==========
        make("Tractions SN", category: "Pull", mode: .ramping, repMin: 5, repMax: 12, increment: 2.5, rest: 180, favorite: true,
             muscles: [(.lats, 1.0), (.upperback, 0.3), (.biceps, 0.3), (.forearms, 0.1)])

        make("Traction pronation large", category: "Pull", mode: .bodyweight, repMin: 5, repMax: 12, rest: 180,
             muscles: [(.lats, 1.0), (.upperback, 0.3), (.biceps, 0.3)])

        make("Pulley serré", category: "Pull", mode: .straight, repMin: 6, repMax: 12, increment: 2.5, rest: 90,
             muscles: [(.lats, 1.0), (.biceps, 0.3), (.forearms, 0.1)])

        make("Tirage horizontal large", category: "Pull", mode: .straight, repMin: 6, repMax: 12, increment: 2.5, rest: 90,
             machine: "r7-6",
             muscles: [(.upperback, 1.0), (.lats, 0.3), (.biceps, 0.3)])

        make("Isolateral row", category: "Pull", mode: .ramping, repMin: 6, repMax: 10, increment: 5, rest: 120,
             machine: "r5",
             muscles: [(.upperback, 1.0), (.lats, 0.3), (.biceps, 0.3)])

        make("Row uni", category: "Pull", mode: .ramping, repMin: 6, repMax: 10, increment: 5, rest: 120,
             muscles: [(.upperback, 1.0), (.lats, 0.3), (.biceps, 0.3)])

        make("Tirage vertical muscle up", category: "Pull", mode: .ramping, repMin: 6, repMax: 12, increment: 5, rest: 120,
             muscles: [(.lats, 1.0), (.upperback, 0.3), (.biceps, 0.1)])

        // ========== PUSH - CHEST ==========
        make("DC assisté", category: "Push", mode: .ramping, repMin: 6, repMax: 10, increment: 5, rest: 180, favorite: true,
             muscles: [(.chest, 1.0), (.triceps, 0.3), (.shoulders, 0.3)])

        make("Chest Press", category: "Push", mode: .ramping, repMin: 6, repMax: 10, increment: 5, rest: 180, favorite: true,
             muscles: [(.chest, 1.0), (.triceps, 0.3), (.shoulders, 0.3)])

        make("Seated Pec", category: "Push", mode: .ramping, repMin: 6, repMax: 10, increment: 5, rest: 180,
             muscles: [(.chest, 1.0), (.triceps, 0.3), (.shoulders, 0.3)])

        make("Développé incliné haltères", category: "Push", mode: .ramping, repMin: 6, repMax: 10, increment: 2, rest: 180,
             muscles: [(.chest, 1.0), (.triceps, 0.3), (.shoulders, 0.3)])

        make("Pec Deck", category: "Push", mode: .ramping, repMin: 8, repMax: 12, increment: 5, rest: 90,
             machine: "r4",
             muscles: [(.chest, 1.0), (.shoulders, 0.1)])

        // ========== PUSH - SHOULDERS ==========
        make("Shoulder Press", category: "Push", mode: .straight, repMin: 6, repMax: 10, increment: 5, rest: 180, favorite: true,
             muscles: [(.shoulders, 1.0), (.triceps, 0.3)])

        make("HSPU", category: "Push", mode: .bodyweight, repMin: 5, repMax: 12, rest: 120,
             muscles: [(.shoulders, 1.0), (.triceps, 0.3)])

        make("Élévations latérales", category: "Push", mode: .straight, repMin: 10, repMax: 15, increment: 1, rest: 90,
             muscles: [(.shoulders, 1.0)])

        // ========== PUSH - TRICEPS ==========
        make("Dips machine", category: "Push", mode: .ramping, repMin: 8, repMax: 12, increment: 5, rest: 90,
             muscles: [(.triceps, 1.0), (.chest, 0.3), (.shoulders, 0.1)])

        make("Extension triceps poulie", category: "Arms", mode: .straight, repMin: 10, repMax: 15, increment: 2.5, rest: 90,
             machine: "r16",
             muscles: [(.triceps, 1.0)])

        make("Extension triceps haltère", category: "Arms", mode: .straight, repMin: 10, repMax: 15, increment: 2, rest: 90,
             muscles: [(.triceps, 1.0)])

        // ========== ARMS ==========
        make("Curl debout", category: "Arms", mode: .ramping, repMin: 6, repMax: 10, increment: 1, rest: 90, favorite: true,
             muscles: [(.biceps, 1.0), (.forearms, 0.3)])

        make("Curl incliné", category: "Arms", mode: .straight, repMin: 8, repMax: 12, increment: 1, rest: 90,
             muscles: [(.biceps, 1.0), (.forearms, 0.1)])

        make("Curl marteau poulie", category: "Arms", mode: .straight, repMin: 8, repMax: 12, increment: 2.5, rest: 90,
             muscles: [(.biceps, 1.0), (.forearms, 0.3)])

        make("Wrist Curl", category: "Arms", mode: .straight, repMin: 12, repMax: 20, increment: 1, rest: 60,
             muscles: [(.forearms, 1.0)])

        // ========== LEGS ==========
        make("Leg Extension", category: "Legs", mode: .ramping, repMin: 8, repMax: 12, increment: 5, rest: 120, favorite: true,
             machine: "r3-5",
             muscles: [(.quads, 1.0)])

        make("Leg Curl", category: "Legs", mode: .straight, repMin: 8, repMax: 12, increment: 5, rest: 120,
             machine: "r4-5",
             muscles: [(.hamstrings, 1.0)])

        // ========== CORE ==========
        make("Crunch déclinés", category: "Core", mode: .straight, repMin: 10, repMax: 15, increment: 2.5, rest: 90, favorite: true,
             muscles: [(.abs, 1.0)])

        make("Relevé de jambes chaise romaine", category: "Core", mode: .bodyweight, repMin: 8, repMax: 15, rest: 90,
             muscles: [(.abs, 1.0), (.obliques, 0.3)])

        return map
    }

    // MARK: - Goals

    static func createGoals(context: ModelContext) {
        let goals: [(MuscleGroup, Double)] = [
            (.shoulders, 18),
            (.biceps, 18),
            (.chest, 18),
            (.abs, 18),
            (.triceps, 15),
            (.upperback, 15),
            (.lats, 15),
            (.quads, 9),
            (.hamstrings, 9),
            (.obliques, 9),
            (.forearms, 9),
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

        template("Full Body", [
            "Tractions SN",
            "Crunch déclinés",
            "HSPU",
            "DC assisté",
            "Leg Extension",
            "Shoulder Press",
            "Curl debout",
            "Pec Deck",
            "Pulley serré"
        ])
    }

    // MARK: - Real Workout History

    static func createRealHistory(context: ModelContext, exercises: [String: Exercise]) {
        let cal = Calendar.current
        let year = cal.component(.year, from: Date())

        func date(_ month: Int, _ day: Int) -> Date {
            cal.date(from: DateComponents(year: year, month: month, day: day, hour: 18, minute: 0)) ?? Date()
        }

        func session(_ d: Date, duration: Int, _ exerciseData: [(String, [(Double, Int)])]) {
            let s = WorkoutSession(
                date: d,
                startTime: d,
                endTime: cal.date(byAdding: .minute, value: duration, to: d),
                isActive: false
            )
            context.insert(s)

            for (i, (name, sets)) in exerciseData.enumerated() {
                guard let ex = exercises[name] else { continue }
                let logged = LoggedExercise(orderIndex: i, exercise: ex)
                logged.session = s
                context.insert(logged)
                s.loggedExercises.append(logged)

                for (j, (weight, reps)) in sets.enumerated() {
                    let set = LoggedSet(weight: weight, reps: reps, setType: .work, timestamp: d, setSlotIndex: j)
                    set.loggedExercise = logged
                    context.insert(set)
                    logged.sets.append(set)
                }

                ex.lastUsed = d
            }
        }

        // April 7
        session(date(4, 7), duration: 75, [
            ("Tractions SN",         [(15, 7), (0, 10), (0, 10)]),
            ("Crunch déclinés",      [(40, 10), (40, 10)]),
            ("HSPU",                 [(0, 10)]),
            ("DC assisté",           [(80, 10), (100, 9), (120, 3)]),
            ("Leg Extension",        [(85, 10)]),
            ("Curl debout",          [(18, 9), (20, 5), (18, 5)]),
            ("Shoulder Press",       [(80, 10), (80, 10)]),
            ("Pec Deck",             [(80, 4), (70, 6)]),
            ("Pulley serré",         [(50, 5), (50, 5)]),
        ])

        // April 3
        session(date(4, 3), duration: 50, [
            ("Tractions SN",         [(0, 10), (0, 10), (0, 10)]),
            ("Crunch déclinés",      [(40, 10), (40, 10), (40, 10)]),
            ("DC assisté",           [(80, 10), (100, 8), (90, 6)]),
            ("Shoulder Press",       [(80, 8)]),
        ])

        // April 1
        session(date(4, 1), duration: 80, [
            ("Tractions SN",         [(15, 7), (0, 10), (0, 10)]),
            ("Crunch déclinés",      [(40, 10), (40, 10), (40, 10)]),
            ("HSPU",                 [(0, 10)]),
            ("Chest Press",          [(100, 10), (120, 6), (100, 6)]),
            ("Leg Extension",        [(85, 10)]),
            ("Pulley serré",         [(45, 10), (50, 8)]),
            ("Curl debout",          [(20, 4), (18, 4)]),
            ("Shoulder Press",       [(80, 10), (80, 8), (80, 4)]),
            ("Pec Deck",             [(85, 4), (75, 4)]),
        ])

        // March 30
        session(date(3, 30), duration: 85, [
            ("Tractions SN",         [(15, 7), (0, 10), (0, 10)]),
            ("Crunch déclinés",      [(40, 10), (40, 10), (40, 10)]),
            ("HSPU",                 [(0, 10)]),
            ("Leg Curl",             [(65, 10), (75, 10), (75, 10)]),
            ("Leg Extension",        [(85, 10), (100, 10), (100, 8)]),
            ("Chest Press",          [(100, 10), (120, 8), (100, 6)]),
            ("Pulley serré",         [(45, 8), (45, 7)]),
            ("Tirage horizontal large", [(45, 6)]),
            ("Curl debout",          [(20, 6), (18, 5)]),
        ])

        // March 25
        session(date(3, 25), duration: 70, [
            ("Tractions SN",         [(15, 7), (0, 10), (0, 10)]),
            ("Crunch déclinés",      [(40, 10), (40, 10), (40, 10)]),
            ("Leg Extension",        [(85, 10), (100, 10), (100, 6)]),
            ("Curl incliné",         [(14, 10), (14, 4)]),
            ("Élévations latérales", [(14, 4)]),
            ("Pec Deck",             [(75, 10), (80, 4)]),
            ("Chest Press",          [(125, 6), (100, 8)]),
        ])

        // March 23
        session(date(3, 23), duration: 65, [
            ("Tractions SN",         [(0, 10), (15, 5), (0, 8)]),
            ("Leg Extension",        [(85, 10), (100, 8)]),
            ("Seated Pec",           [(100, 10), (130, 6), (130, 4)]),
            ("Shoulder Press",       [(80, 10), (85, 5), (80, 4)]),
            ("Curl debout",          [(18, 8), (18, 8)]),
        ])

        // March 20
        session(date(3, 20), duration: 75, [
            ("Tractions SN",         [(0, 10), (0, 10), (0, 10)]),
            ("Seated Pec",           [(100, 10), (120, 6), (120, 5), (100, 5)]),
            ("Élévations latérales", [(12, 10)]),
            ("Row uni",              [(90, 6), (80, 10)]),
            ("Pec Deck",             [(60, 10), (70, 8), (75, 5)]),
            ("Shoulder Press",       [(80, 4), (70, 10)]),
            ("Curl incliné",         [(14, 9), (14, 6)]),
        ])
    }
}
