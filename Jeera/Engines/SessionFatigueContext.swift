import Foundation

/// Snapshot of exercises completed before the current one in the same session.
/// Passed to ProgressionEngine so it can adjust suggestions based on accumulated
/// systemic and local fatigue — not just what happened on THIS exercise.
struct SessionFatigueContext {
    struct PriorLoad {
        let primaryParent: MuscleParent
        let workSetsCompleted: Int
        let fatigueClass: FatigueClass
    }

    let priorLoads: [PriorLoad]

    static var empty: SessionFatigueContext { .init(priorLoads: []) }

    /// Rough systemic cost: heavy sets cost more than light ones.
    var totalSystemicCost: Double {
        priorLoads.reduce(0.0) { acc, load in
            acc + Double(load.workSetsCompleted) * load.fatigueClass.baseRepDrop
        }
    }

    /// Completed work sets targeting the same primary muscle parent before this exercise.
    func sameParentSets(for parent: MuscleParent) -> Int {
        priorLoads
            .filter { $0.primaryParent == parent }
            .reduce(0) { $0 + $1.workSetsCompleted }
    }

    /// Returns true when session context suggests meaningful accumulated fatigue for this exercise.
    /// - Systemic: > 12 cost points (≈ 6 heavy compound sets or 8 medium sets)
    /// - Local: ≥ 3 sets targeting the same parent muscle group
    func isSignificant(for primaryParent: MuscleParent?) -> Bool {
        if totalSystemicCost > 12 { return true }
        if let parent = primaryParent, sameParentSets(for: parent) >= 3 { return true }
        return false
    }

    /// Human-readable note for the UI (French).
    func fatigueNote(for primaryParent: MuscleParent?) -> String? {
        guard isSignificant(for: primaryParent) else { return nil }
        if let parent = primaryParent, sameParentSets(for: parent) >= 3 {
            return "Fatigue locale \(parent.displayName) détectée"
        }
        return "Fatigue systémique de séance détectée"
    }
}
