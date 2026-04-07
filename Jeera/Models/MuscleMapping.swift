import Foundation
import SwiftData

@Model
final class MuscleMapping {
    var muscleGroup: MuscleGroup
    var coefficient: Double

    @Relationship var exercise: Exercise?

    init(muscleGroup: MuscleGroup, coefficient: Double) {
        self.muscleGroup = muscleGroup
        self.coefficient = coefficient
    }
}
