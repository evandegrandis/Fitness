import Testing
import Foundation
@testable import Jeera

@Suite("Effective Sets Engine Tests")
struct EffectiveSetsEngineTests {

    // MARK: - Helpers

    private func makeExercise(name: String, muscles: [(MuscleGroup, Double)]) -> Exercise {
        let ex = Exercise(name: name)
        for (muscle, coeff) in muscles {
            let mapping = MuscleMapping(muscleGroup: muscle, coefficient: coeff)
            ex.muscleMappings.append(mapping)
        }
        return ex
    }

    private func makeLoggedExercise(exercise: Exercise, completedSets: Int) -> LoggedExercise {
        let logged = LoggedExercise(exercise: exercise)
        for i in 0..<completedSets {
            let set = LoggedSet(weight: 80, reps: 10, setType: .work, setSlotIndex: i, completed: true)
            logged.sets.append(set)
        }
        return logged
    }

    // MARK: - Effective Sets Calculation

    @Test("Single exercise effective sets")
    func singleExercise() {
        let ex = makeExercise(name: "Chest Press", muscles: [
            (.chest, 1.0),
            (.triceps, 0.3),
            (.frontdelts, 0.3),
        ])
        let logged = makeLoggedExercise(exercise: ex, completedSets: 3)

        let result = EffectiveSetsEngine.effectiveSets(for: logged)

        #expect(result[.chest] == 3.0)
        #expect(result[.triceps]! == 0.9, "3 * 0.3 = 0.9")
        #expect(result[.frontdelts]! == 0.9)
    }

    @Test("Primary muscle gets full attribution")
    func primaryMuscle() {
        let ex = makeExercise(name: "Leg Extension", muscles: [(.quads, 1.0)])
        let logged = makeLoggedExercise(exercise: ex, completedSets: 4)

        let result = EffectiveSetsEngine.effectiveSets(for: logged)
        #expect(result[.quads] == 4.0)
        #expect(result[.hamstrings] == nil)
    }

    @Test("Secondary muscles get fractional attribution")
    func secondaryMuscles() {
        let ex = makeExercise(name: "Pull-Up", muscles: [
            (.lats, 1.0),
            (.upperback, 0.3),
            (.biceps, 0.3),
            (.forearms, 0.1),
        ])
        let logged = makeLoggedExercise(exercise: ex, completedSets: 3)

        let result = EffectiveSetsEngine.effectiveSets(for: logged)

        #expect(result[.lats] == 3.0)
        #expect(result[.upperback]! == 0.9)
        #expect(result[.biceps]! == 0.9)
        #expect(abs(result[.forearms]! - 0.3) < 0.001)
    }

    @Test("Zero sets returns zeros")
    func zeroSets() {
        let ex = makeExercise(name: "Curl", muscles: [(.biceps, 1.0)])
        let logged = makeLoggedExercise(exercise: ex, completedSets: 0)

        let result = EffectiveSetsEngine.effectiveSets(for: logged)
        #expect(result[.biceps] == 0)
    }

    // MARK: - Weekly Progress

    @Test("Weekly progress percentage calculation")
    func weeklyPercentage() {
        let progress = MuscleGroupProgress(
            muscleGroup: .chest,
            effectiveSets: 9,
            goalSets: 12,
            previousWeekSets: 6
        )

        #expect(progress.percentage == 75)
        #expect(progress.remaining == 3)
        #expect(progress.delta == 3)
        #expect(!progress.isComplete)
    }

    @Test("Complete when at goal")
    func completeAtGoal() {
        let progress = MuscleGroupProgress(
            muscleGroup: .chest,
            effectiveSets: 12,
            goalSets: 12,
            previousWeekSets: 10
        )

        #expect(progress.percentage == 100)
        #expect(progress.remaining == 0)
        #expect(progress.isComplete)
    }

    @Test("Over goal caps display but shows completion")
    func overGoal() {
        let progress = MuscleGroupProgress(
            muscleGroup: .chest,
            effectiveSets: 15,
            goalSets: 12,
            previousWeekSets: 10
        )

        #expect(progress.percentage == 125)
        #expect(progress.remaining == 0)
        #expect(progress.isComplete)
    }

    @Test("Zero goal returns zero percentage")
    func zeroGoal() {
        let progress = MuscleGroupProgress(
            muscleGroup: .chest,
            effectiveSets: 5,
            goalSets: 0,
            previousWeekSets: 3
        )

        #expect(progress.percentage == 0)
    }

    @Test("Delta calculation")
    func deltaCalculation() {
        let progress = MuscleGroupProgress(
            muscleGroup: .biceps,
            effectiveSets: 8,
            goalSets: 10,
            previousWeekSets: 10
        )

        #expect(progress.delta == -2)
    }

    // MARK: - Live Impact

    @Test("Live impact calculation")
    func liveImpact() {
        let ex = makeExercise(name: "Row", muscles: [
            (.upperback, 1.0),
            (.lats, 0.3),
            (.biceps, 0.3),
        ])

        let result = EffectiveSetsEngine.liveImpact(exercise: ex, completedSets: 3)

        #expect(result[.upperback] == 3.0)
        #expect(result[.lats]! == 0.9)
        #expect(result[.biceps]! == 0.9)
    }

    // MARK: - Multiple Exercises Aggregation

    @Test("Aggregated effective sets from multiple exercises")
    func multiExerciseAggregation() {
        // Simulating chest press + pec deck in one session
        let chestPress = makeExercise(name: "Chest Press", muscles: [(.chest, 1.0), (.triceps, 0.3)])
        let pecDeck = makeExercise(name: "Pec Deck", muscles: [(.chest, 1.0)])

        let logged1 = makeLoggedExercise(exercise: chestPress, completedSets: 3)
        let logged2 = makeLoggedExercise(exercise: pecDeck, completedSets: 3)

        let sets1 = EffectiveSetsEngine.effectiveSets(for: logged1)
        let sets2 = EffectiveSetsEngine.effectiveSets(for: logged2)

        let totalChest = (sets1[.chest] ?? 0) + (sets2[.chest] ?? 0)
        let totalTriceps = (sets1[.triceps] ?? 0) + (sets2[.triceps] ?? 0)

        #expect(totalChest == 6.0) // 3 + 3
        #expect(totalTriceps == 0.9) // 0.9 + 0
    }
}
