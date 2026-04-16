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

    // MARK: - Leaf-Level Effective Sets

    @Test("Single exercise leaf effective sets")
    func singleExerciseLeaf() {
        let ex = makeExercise(name: "Chest Press", muscles: [
            (.pectStern, 1.0),
            (.tricepsLat, 0.3),
            (.deltAnt, 0.3),
        ])
        let logged = makeLoggedExercise(exercise: ex, completedSets: 3)

        let result = EffectiveSetsEngine.leafSets(for: logged)

        #expect(result[.pectStern] == 3.0)
        #expect(result[.tricepsLat]! == 0.9, "3 * 0.3 = 0.9")
        #expect(result[.deltAnt]! == 0.9)
    }

    @Test("Primary muscle gets full attribution")
    func primaryMuscle() {
        let ex = makeExercise(name: "Leg Extension", muscles: [(.vasteLat, 1.0)])
        let logged = makeLoggedExercise(exercise: ex, completedSets: 4)

        let result = EffectiveSetsEngine.leafSets(for: logged)
        #expect(result[.vasteLat] == 4.0)
        #expect(result[.bicepsFemoral] == nil)
    }

    @Test("Secondary muscles get fractional attribution")
    func secondaryMuscles() {
        let ex = makeExercise(name: "Pull-Up", muscles: [
            (.latSup, 1.0),
            (.trapMid, 0.3),
            (.bicepsCourt, 0.3),
            (.brachioradial, 0.1),
        ])
        let logged = makeLoggedExercise(exercise: ex, completedSets: 3)

        let result = EffectiveSetsEngine.leafSets(for: logged)

        #expect(result[.latSup] == 3.0)
        #expect(result[.trapMid]! == 0.9)
        #expect(result[.bicepsCourt]! == 0.9)
        #expect(abs(result[.brachioradial]! - 0.3) < 0.001)
    }

    @Test("Zero sets returns empty")
    func zeroSets() {
        let ex = makeExercise(name: "Curl", muscles: [(.bicepsCourt, 1.0)])
        let logged = makeLoggedExercise(exercise: ex, completedSets: 0)

        let result = EffectiveSetsEngine.leafSets(for: logged)
        #expect(result.isEmpty)
    }

    // MARK: - Parent-Level Effective Sets

    @Test("Parent sets aggregation uses max coefficient per parent")
    func parentSetsAggregation() {
        // Chest Press maps to pectStern (1.0) and pectClav (0.5) — both under Pectoraux parent.
        // The engine should use max(1.0, 0.5) = 1.0 for Pectoraux.
        let ex = makeExercise(name: "Chest Press", muscles: [
            (.pectStern, 1.0),
            (.pectClav, 0.5),
            (.tricepsLat, 0.3),
        ])
        let logged = makeLoggedExercise(exercise: ex, completedSets: 3)

        let result = EffectiveSetsEngine.parentSets(for: logged)

        #expect(result[.pectoraux] == 3.0) // 3 * max(1.0, 0.5)
        #expect(result[.triceps] == 0.9)   // 3 * 0.3
    }

    // MARK: - ParentMuscleProgress

    @Test("ParentMuscleProgress coverage calculation")
    func coverageCalculation() {
        let progress = ParentMuscleProgress(
            parent: .pectoraux,
            effectiveSets: 9,
            goalSets: 12
        )

        #expect(progress.coverage == 0.75)
        #expect(progress.percentDisplay == 75)
        #expect(progress.remaining == 3)
        #expect(progress.status == .onTrack)
    }

    @Test("Covered when at goal")
    func coveredAtGoal() {
        let progress = ParentMuscleProgress(
            parent: .pectoraux,
            effectiveSets: 12,
            goalSets: 12
        )

        #expect(progress.coverage == 1.0)
        #expect(progress.remaining == 0)
        #expect(progress.status == .covered)
    }

    @Test("Over goal caps coverage at 1.0")
    func overGoalCaps() {
        let progress = ParentMuscleProgress(
            parent: .pectoraux,
            effectiveSets: 15,
            goalSets: 12
        )

        #expect(progress.coverage == 1.0)
        #expect(progress.remaining == 0)
        #expect(progress.status == .covered)
    }

    @Test("Zero goal returns zero coverage")
    func zeroGoal() {
        let progress = ParentMuscleProgress(
            parent: .pectoraux,
            effectiveSets: 5,
            goalSets: 0
        )

        #expect(progress.coverage == 0)
    }

    @Test("Priority status when very low coverage")
    func priorityStatus() {
        let progress = ParentMuscleProgress(
            parent: .biceps,
            effectiveSets: 2,
            goalSets: 12
        )

        #expect(progress.status == .priority)
    }

    @Test("To strengthen status for moderate coverage")
    func toStrengthenStatus() {
        let progress = ParentMuscleProgress(
            parent: .biceps,
            effectiveSets: 6,
            goalSets: 12
        )

        #expect(progress.status == .toStrengthen)
    }

    // MARK: - Live Parent Impact

    @Test("Live parent impact calculation")
    func liveParentImpact() {
        let ex = makeExercise(name: "Row", muscles: [
            (.trapMid, 1.0),
            (.latSup, 0.3),
            (.bicepsCourt, 0.3),
        ])

        let result = EffectiveSetsEngine.liveParentImpact(exercise: ex, completedSets: 3)

        #expect(result[.dosHaut] == 3.0)
        #expect(result[.grandDorsal] == 0.9)
        #expect(result[.biceps] == 0.9)
    }

    // MARK: - Multiple Exercises Aggregation

    @Test("Aggregated leaf sets from multiple exercises")
    func multiExerciseAggregation() {
        let chestPress = makeExercise(name: "Chest Press", muscles: [(.pectStern, 1.0), (.tricepsLat, 0.3)])
        let pecDeck = makeExercise(name: "Pec Deck", muscles: [(.pectStern, 1.0)])

        let logged1 = makeLoggedExercise(exercise: chestPress, completedSets: 3)
        let logged2 = makeLoggedExercise(exercise: pecDeck, completedSets: 3)

        let sets1 = EffectiveSetsEngine.leafSets(for: logged1)
        let sets2 = EffectiveSetsEngine.leafSets(for: logged2)

        let totalPectStern = (sets1[.pectStern] ?? 0) + (sets2[.pectStern] ?? 0)
        let totalTriceps = (sets1[.tricepsLat] ?? 0) + (sets2[.tricepsLat] ?? 0)

        #expect(totalPectStern == 6.0) // 3 + 3
        #expect(totalTriceps == 0.9) // 0.9 + 0
    }
}
