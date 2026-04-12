import Foundation
import SwiftData

/// Weekly (used as rolling 7-day) target for a parent muscle group.
/// We target at the PARENT level — users don't set goals on individual
/// muscle heads. Leaf-level effective-sets aggregate up to the parent when
/// computing coverage.
@Model
final class MuscleGoal {
    @Attribute(.unique) var muscleGroupRaw: String
    var weeklyGoalSets: Double

    /// Parent accessor. Handles both current parent raw values and legacy
    /// leaf / pre-split strings so the store can always be read.
    var parent: MuscleParent {
        get {
            if let direct = MuscleParent(rawValue: muscleGroupRaw) {
                return direct
            }
            // Legacy: raw was previously a leaf/coarse MuscleGroup value.
            if let leaf = MuscleGroup(rawValue: muscleGroupRaw) ?? MuscleGroup.legacyMapping[muscleGroupRaw] {
                return leaf.parent
            }
            return .pectoraux
        }
        set { muscleGroupRaw = newValue.rawValue }
    }

    init(parent: MuscleParent, weeklyGoalSets: Double) {
        self.muscleGroupRaw = parent.rawValue
        self.weeklyGoalSets = weeklyGoalSets
    }
}
