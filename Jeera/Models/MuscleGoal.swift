import Foundation
import SwiftData

@Model
final class MuscleGoal {
    @Attribute(.unique) var muscleGroupRaw: String
    var weeklyGoalSets: Double

    var muscleGroup: MuscleGroup {
        get { MuscleGroup(rawValue: muscleGroupRaw) ?? .chest }
        set { muscleGroupRaw = newValue.rawValue }
    }

    init(muscleGroup: MuscleGroup, weeklyGoalSets: Double) {
        self.muscleGroupRaw = muscleGroup.rawValue
        self.weeklyGoalSets = weeklyGoalSets
    }
}
