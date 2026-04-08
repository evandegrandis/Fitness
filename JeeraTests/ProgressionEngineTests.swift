import Testing
import Foundation
@testable import Jeera

@Suite("Progression Engine Tests")
struct ProgressionEngineTests {

    // MARK: - Helpers

    private func makeExercise(
        mode: SetPatternMode = .straight,
        repMin: Int = 8,
        repMax: Int = 12,
        increment: Double = 2.5
    ) -> Exercise {
        Exercise(
            name: "Test Exercise",
            setPatternMode: mode,
            repTargetMin: repMin,
            repTargetMax: repMax,
            smallestIncrement: increment
        )
    }

    private func makeSet(weight: Double, reps: Int, type: SetType = .work, slot: Int = 0) -> LoggedSet {
        LoggedSet(weight: weight, reps: reps, setType: type, setSlotIndex: slot)
    }

    // MARK: - Straight Sets

    @Test("Straight: progress when all sets hit target max")
    func straightProgressAll() {
        let ex = makeExercise(repMin: 8, repMax: 10, increment: 2.5)
        let prev = [
            makeSet(weight: 80, reps: 10, slot: 0),
            makeSet(weight: 80, reps: 10, slot: 1),
            makeSet(weight: 80, reps: 10, slot: 2),
        ]
        let suggestion = ProgressionEngine.suggestStraight(exercise: ex, previousSets: prev, currentSetIndex: 0, increment: 2.5)

        #expect(suggestion.weight == 82.5)
        #expect(suggestion.reps == 8)
    }

    @Test("Straight: keep weight when some sets below minimum")
    func straightKeepWeight() {
        let ex = makeExercise(repMin: 8, repMax: 10)
        let prev = [
            makeSet(weight: 80, reps: 10, slot: 0),
            makeSet(weight: 80, reps: 8, slot: 1),
            makeSet(weight: 80, reps: 6, slot: 2),
        ]
        let suggestion = ProgressionEngine.suggestStraight(exercise: ex, previousSets: prev, currentSetIndex: 0, increment: 2.5)

        #expect(suggestion.weight == 80)
    }

    @Test("Straight: push for more reps when in range but not at max")
    func straightPushReps() {
        let ex = makeExercise(repMin: 8, repMax: 10)
        let prev = [
            makeSet(weight: 80, reps: 9, slot: 0),
            makeSet(weight: 80, reps: 9, slot: 1),
            makeSet(weight: 80, reps: 8, slot: 2),
        ]
        let suggestion = ProgressionEngine.suggestStraight(exercise: ex, previousSets: prev, currentSetIndex: 0, increment: 2.5)

        #expect(suggestion.weight == 80)
        #expect(suggestion.reps == 10)
    }

    @Test("Straight: no previous data")
    func straightNoPrevious() {
        let ex = makeExercise()
        let suggestion = ProgressionEngine.suggestStraight(exercise: ex, previousSets: [], currentSetIndex: 0, increment: 2.5)

        #expect(suggestion.weight == 20)
    }

    // MARK: - Slot-Based (Ramping)

    @Test("Slot-based: progress each set independently")
    func slotBasedIndependent() {
        let ex = makeExercise(mode: .ramping, repMin: 6, repMax: 10, increment: 5)
        let prev = [
            makeSet(weight: 60, reps: 10, slot: 0),
            makeSet(weight: 80, reps: 8, slot: 1),
            makeSet(weight: 100, reps: 6, slot: 2),
        ]

        let s0 = ProgressionEngine.suggestSlotBased(exercise: ex, previousSets: prev, currentSetIndex: 0, increment: 5)
        #expect(s0.weight == 65) // hit max → progress

        let s1 = ProgressionEngine.suggestSlotBased(exercise: ex, previousSets: prev, currentSetIndex: 1, increment: 5)
        #expect(s1.weight == 80) // in range → same weight, push reps

        let s2 = ProgressionEngine.suggestSlotBased(exercise: ex, previousSets: prev, currentSetIndex: 2, increment: 5)
        #expect(s2.weight == 100) // at minimum → same weight
    }

    @Test("Slot-based: mixed weights like real pull-up data")
    func slotBasedMixedWeights() {
        let ex = makeExercise(mode: .ramping, repMin: 5, repMax: 12, increment: 2.5)
        // Simulating: 15kgx7, 0kgx10, 0kgx10
        let prev = [
            makeSet(weight: 15, reps: 7, slot: 0),
            makeSet(weight: 0, reps: 10, slot: 1),
            makeSet(weight: 0, reps: 10, slot: 2),
        ]

        let s0 = ProgressionEngine.suggestSlotBased(exercise: ex, previousSets: prev, currentSetIndex: 0, increment: 2.5)
        #expect(s0.weight == 15) // 7 reps in 5-12 range → same weight, push reps
        #expect(s0.reps == 8)

        let s1 = ProgressionEngine.suggestSlotBased(exercise: ex, previousSets: prev, currentSetIndex: 1, increment: 2.5)
        #expect(s1.weight == 0) // 10 reps in range → same weight, push reps

        let s2 = ProgressionEngine.suggestSlotBased(exercise: ex, previousSets: prev, currentSetIndex: 2, increment: 2.5)
        #expect(s2.weight == 0) // same as slot 1
    }

    @Test("Slot-based: extra set beyond previous count")
    func slotBasedExtraSet() {
        let ex = makeExercise(mode: .ramping, repMin: 8, repMax: 12, increment: 5)
        let prev = [
            makeSet(weight: 80, reps: 10, slot: 0),
            makeSet(weight: 100, reps: 8, slot: 1),
        ]

        let s2 = ProgressionEngine.suggestSlotBased(exercise: ex, previousSets: prev, currentSetIndex: 2, increment: 5)
        #expect(s2.weight == 100) // matches last previous set
        #expect(s2.reps == 8)
    }

    // MARK: - Top Set + Backoffs

    @Test("Top Set + Backoff: progress top set when at target")
    func topSetProgress() {
        let ex = makeExercise(mode: .topSetBackoff, repMin: 6, repMax: 8, increment: 2.5)
        let prev = [
            makeSet(weight: 100, reps: 8, type: .topSet, slot: 0),
            makeSet(weight: 80, reps: 8, type: .backoff, slot: 1),
            makeSet(weight: 80, reps: 7, type: .backoff, slot: 2),
        ]

        let topSuggestion = ProgressionEngine.suggestTopSetBackoff(exercise: ex, previousSets: prev, currentSetIndex: 0, increment: 2.5)
        #expect(topSuggestion.weight == 102.5)
        #expect(topSuggestion.setType == .topSet)
    }

    @Test("Top Set + Backoff: independent progression")
    func topSetIndependentProgress() {
        let ex = makeExercise(mode: .topSetBackoff, repMin: 6, repMax: 8, increment: 2.5)
        let prev = [
            makeSet(weight: 100, reps: 8, type: .topSet, slot: 0),
            makeSet(weight: 80, reps: 8, type: .backoff, slot: 1),
            makeSet(weight: 80, reps: 6, type: .backoff, slot: 2),
        ]

        let top = ProgressionEngine.suggestTopSetBackoff(exercise: ex, previousSets: prev, currentSetIndex: 0, increment: 2.5)
        #expect(top.weight == 102.5)

        let back1 = ProgressionEngine.suggestTopSetBackoff(exercise: ex, previousSets: prev, currentSetIndex: 1, increment: 2.5)
        #expect(back1.weight == 82.5)

        let back2 = ProgressionEngine.suggestTopSetBackoff(exercise: ex, previousSets: prev, currentSetIndex: 2, increment: 2.5)
        #expect(back2.weight == 80)
    }

    // MARK: - Bodyweight

    @Test("Bodyweight: progress reps")
    func bodyweightProgressReps() {
        let ex = makeExercise(mode: .bodyweight, repMin: 6, repMax: 12)
        let prev = [
            makeSet(weight: 0, reps: 8, slot: 0),
            makeSet(weight: 0, reps: 7, slot: 1),
        ]

        let suggestion = ProgressionEngine.suggestBodyweight(exercise: ex, previousSets: prev, currentSetIndex: 0)
        #expect(suggestion.weight == 0)
        #expect(suggestion.reps == 9)
    }

    @Test("Bodyweight: at max reps suggests adding weight")
    func bodyweightAtMax() {
        let ex = makeExercise(mode: .bodyweight, repMin: 6, repMax: 12)
        let prev = [
            makeSet(weight: 0, reps: 12, slot: 0),
        ]

        let suggestion = ProgressionEngine.suggestBodyweight(exercise: ex, previousSets: prev, currentSetIndex: 0)
        #expect(suggestion.reps == 12)
        #expect(suggestion.explanation.contains("adding weight"))
    }

    // MARK: - Assisted Bodyweight

    @Test("Assisted: reduce assistance when all sets at target")
    func assistedReduce() {
        let ex = makeExercise(mode: .assistedBodyweight, repMin: 8, repMax: 10, increment: 5)
        let prev = [
            makeSet(weight: 20, reps: 10, slot: 0),
            makeSet(weight: 20, reps: 10, slot: 1),
        ]

        let suggestion = ProgressionEngine.suggestAssistedBodyweight(exercise: ex, previousSets: prev, currentSetIndex: 0, increment: 5)
        #expect(suggestion.weight == 15)
    }

    @Test("Assisted: keep assistance when not at target")
    func assistedKeep() {
        let ex = makeExercise(mode: .assistedBodyweight, repMin: 8, repMax: 10)
        let prev = [
            makeSet(weight: 20, reps: 9, slot: 0),
            makeSet(weight: 20, reps: 8, slot: 1),
        ]

        let suggestion = ProgressionEngine.suggestAssistedBodyweight(exercise: ex, previousSets: prev, currentSetIndex: 0, increment: 5)
        #expect(suggestion.weight == 20)
    }

    // MARK: - Repeat Last Set

    @Test("Repeat last set returns correct values")
    func repeatLast() {
        let sets = [
            makeSet(weight: 80, reps: 10, slot: 0),
            makeSet(weight: 80, reps: 8, slot: 1),
        ]

        let suggestion = ProgressionEngine.repeatLastSet(from: sets)
        #expect(suggestion != nil)
        #expect(suggestion?.weight == 80)
        #expect(suggestion?.reps == 8)
    }
}
