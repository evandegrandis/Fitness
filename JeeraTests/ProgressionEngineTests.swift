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
        increment: Double = 2.5,
        fatigue: FatigueClass = .medium
    ) -> Exercise {
        Exercise(
            name: "Test Exercise",
            setPatternMode: mode,
            repTargetMin: repMin,
            repTargetMax: repMax,
            smallestIncrement: increment,
            fatigueClass: fatigue
        )
    }

    private func makeSet(weight: Double, reps: Int, type: SetType = .work, slot: Int = 0, completed: Bool = true) -> LoggedSet {
        let s = LoggedSet(weight: weight, reps: reps, setType: type, setSlotIndex: slot)
        s.completed = completed
        return s
    }

    // MARK: - First working set: anchor + promotion

    @Test("First set: promotion granted when anchor validated (normal rule)")
    func firstSetPromotesOnNormalRule() {
        // M fatigue → 1 of last 2 sessions needs first_set >= rep_max AND avg reps at anchor >= rep_min+1.
        let ex = makeExercise(repMin: 8, repMax: 10, increment: 2.5, fatigue: .medium)
        let lastSession = [
            makeSet(weight: 80, reps: 10, slot: 0),
            makeSet(weight: 80, reps: 9, slot: 1),
            makeSet(weight: 80, reps: 9, slot: 2),
        ]
        let s = ProgressionEngine.suggest(for: ex, previousSets: lastSession, currentSetIndex: 0, recentHistory: [])
        #expect(s.weight == 82.5)
        #expect(s.reps == 10) // rep_min + buffer=2 clamped by rep_max
    }

    @Test("First set: no promotion → keep anchor, +1 rep target")
    func firstSetKeepsAnchorWhenNoPromotion() {
        let ex = makeExercise(repMin: 8, repMax: 10, increment: 2.5, fatigue: .medium)
        let lastSession = [
            makeSet(weight: 80, reps: 9, slot: 0),   // first set < rep_max → no promo
            makeSet(weight: 80, reps: 8, slot: 1),
        ]
        let s = ProgressionEngine.suggest(for: ex, previousSets: lastSession, currentSetIndex: 0, recentHistory: [])
        #expect(s.weight == 80)
        #expect(s.reps == 10) // median_first_set_reps (9) + 1 capped at rep_max
    }

    @Test("First set: heavy-class needs 2 of last 3 validations to promote")
    func firstSetHeavyStrictPromotion() {
        let ex = makeExercise(repMin: 6, repMax: 10, increment: 2.5, fatigue: .heavy)
        let sessionGood = [
            makeSet(weight: 100, reps: 10, slot: 0),
            makeSet(weight: 100, reps: 7, slot: 1),
        ]
        let sessionBad = [
            makeSet(weight: 100, reps: 8, slot: 0), // first < rep_max
            makeSet(weight: 100, reps: 6, slot: 1),
        ]
        let noPromo = ProgressionEngine.suggest(
            for: ex,
            previousSets: sessionGood,
            currentSetIndex: 0,
            recentHistory: [sessionBad, sessionBad]
        )
        #expect(noPromo.weight == 100) // only 1 of 3 qualifies → no promo

        let promo = ProgressionEngine.suggest(
            for: ex,
            previousSets: sessionGood,
            currentSetIndex: 0,
            recentHistory: [sessionGood, sessionBad]
        )
        #expect(promo.weight == 102.5) // 2 of 3 qualify → promote
    }

    @Test("First time ever: fallback suggestion")
    func firstTimeFallback() {
        let ex = makeExercise()
        let s = ProgressionEngine.suggest(for: ex, previousSets: [], currentSetIndex: 0)
        #expect(s.weight == 20)
    }

    // MARK: - Subsequent sets: predicted rep drop (the core bug-fix)

    @Test("Subsequent set: heavy-class drops 2 reps at same load")
    func subsequentHeavyClassDrops2Reps() {
        let ex = makeExercise(repMin: 6, repMax: 10, increment: 2.5, fatigue: .heavy)
        let doneToday = [makeSet(weight: 15, reps: 8, slot: 0)]
        let s = ProgressionEngine.suggest(
            for: ex,
            previousSets: [],
            currentSetIndex: 1,
            currentSessionSets: doneToday
        )
        #expect(s.weight == 15)
        #expect(s.reps == 6) // 8 - 2 = 6 ≥ rep_min → keep load
    }

    @Test("Subsequent set: back off when predicted falls below rep_min")
    func subsequentBacksOffBelowFloor() {
        let ex = makeExercise(repMin: 8, repMax: 12, increment: 2.5, fatigue: .heavy)
        // Two sets done today: 100x8, 100x8. Next predicted = 8 - 2 - 0.5(set3) = 5.5 < 8.
        let doneToday = [
            makeSet(weight: 100, reps: 8, slot: 0),
            makeSet(weight: 100, reps: 8, slot: 1),
        ]
        let s = ProgressionEngine.suggest(
            for: ex,
            previousSets: [],
            currentSetIndex: 2,
            currentSessionSets: doneToday
        )
        #expect(s.weight == 97.5) // -1 increment
        #expect(s.reps == 10)     // ceil((8+12)/2)
    }

    @Test("Subsequent set: light-class keeps load longer")
    func subsequentLightClassKeepsLoad() {
        let ex = makeExercise(repMin: 10, repMax: 15, increment: 2.5, fatigue: .light)
        let doneToday = [makeSet(weight: 40, reps: 14, slot: 0)]
        let s = ProgressionEngine.suggest(
            for: ex,
            previousSets: [],
            currentSetIndex: 1,
            currentSessionSets: doneToday
        )
        #expect(s.weight == 40)
        #expect(s.reps == 13) // 14 - 1 = 13
    }

    @Test("Ignores last session when current session has sets (user bug-fix)")
    func currentSessionBeatsPreviousSession() {
        // Last session was a brand new +15x8. Today set1 repeated +15x8.
        // The old engine would still suggest +15x8 for set 2 because it replayed
        // last session's slot. The new engine must predict a drop instead.
        let ex = makeExercise(mode: .weightedBodyweight, repMin: 5, repMax: 12, increment: 2.5, fatigue: .heavy)
        let lastSession = [
            makeSet(weight: 0, reps: 10, slot: 0),
            makeSet(weight: 15, reps: 8, slot: 1),
        ]
        let doneToday = [makeSet(weight: 15, reps: 8, slot: 0)]
        let s = ProgressionEngine.suggest(
            for: ex,
            previousSets: lastSession,
            currentSetIndex: 1,
            currentSessionSets: doneToday
        )
        #expect(s.weight == 15) // same load (predicted 6 ≥ rep_min 5)
        #expect(s.reps == 6)    // 8 - 2 = 6 — NOT 8 again
    }

    // MARK: - Bodyweight mode

    @Test("Bodyweight: first set = best recent reps + 1")
    func bodyweightFirstSet() {
        let ex = makeExercise(mode: .bodyweight, repMin: 6, repMax: 12)
        let last = [makeSet(weight: 0, reps: 8, slot: 0)]
        let s = ProgressionEngine.suggest(for: ex, previousSets: last, currentSetIndex: 0)
        #expect(s.weight == 0)
        #expect(s.reps == 9)
    }

    @Test("Bodyweight: at rep_max suggests adding weight")
    func bodyweightAtMax() {
        let ex = makeExercise(mode: .bodyweight, repMin: 6, repMax: 12)
        let last = [makeSet(weight: 0, reps: 12, slot: 0)]
        let s = ProgressionEngine.suggest(for: ex, previousSets: last, currentSetIndex: 0)
        #expect(s.reps == 12)
        #expect(s.explanation.contains("lester"))
    }

    // MARK: - Assisted bodyweight

    @Test("Assisted: reduce assistance when validation hits rep_max")
    func assistedReducesAssistance() {
        let ex = makeExercise(mode: .assistedBodyweight, repMin: 8, repMax: 10, increment: 5)
        let last = [
            makeSet(weight: 20, reps: 10, slot: 0),
            makeSet(weight: 20, reps: 10, slot: 1),
        ]
        let s = ProgressionEngine.suggest(for: ex, previousSets: last, currentSetIndex: 0)
        #expect(s.weight == 15)
    }

    // MARK: - Repeat last set helper

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

    // MARK: - e1RM

    @Test("Epley e1RM rounds correctly")
    func e1RMEpley() {
        #expect(ProgressionEngine.estimated1RM(weight: 100, reps: 5) == 100 * (1 + 5.0 / 30.0))
        #expect(ProgressionEngine.estimated1RM(weight: 80, reps: 1) == 80)
        #expect(ProgressionEngine.estimated1RM(weight: 80, reps: 0) == nil)
        #expect(ProgressionEngine.estimated1RM(weight: 80, reps: 16) == nil)
    }
}
