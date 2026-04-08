import Foundation
import SwiftData

@Model
final class Exercise {
    @Attribute(.unique) var id: UUID
    var name: String
    var category: String
    var setPatternMode: SetPatternMode
    var repTargetMin: Int
    var repTargetMax: Int
    var smallestIncrement: Double
    var isFavorite: Bool
    var createdByUser: Bool
    var sortOrder: Int
    var suggestedRestSeconds: Int
    var machineSetting: String
    var setupNotes: String

    @Relationship(deleteRule: .cascade) var muscleMappings: [MuscleMapping]

    var lastUsed: Date?

    init(
        id: UUID = UUID(),
        name: String,
        category: String = "",
        setPatternMode: SetPatternMode = .straight,
        repTargetMin: Int = 8,
        repTargetMax: Int = 12,
        smallestIncrement: Double = 2.5,
        isFavorite: Bool = false,
        createdByUser: Bool = false,
        sortOrder: Int = 0,
        suggestedRestSeconds: Int = 120,
        machineSetting: String = "",
        setupNotes: String = "",
        muscleMappings: [MuscleMapping] = []
    ) {
        self.id = id
        self.name = name
        self.category = category
        self.setPatternMode = setPatternMode
        self.repTargetMin = repTargetMin
        self.repTargetMax = repTargetMax
        self.smallestIncrement = smallestIncrement
        self.isFavorite = isFavorite
        self.createdByUser = createdByUser
        self.sortOrder = sortOrder
        self.suggestedRestSeconds = suggestedRestSeconds
        self.machineSetting = machineSetting
        self.setupNotes = setupNotes
        self.muscleMappings = muscleMappings
    }

    var isBigExercise: Bool { suggestedRestSeconds >= 150 }

    var repTargetDisplay: String {
        if repTargetMin == repTargetMax {
            return "\(repTargetMin)"
        }
        return "\(repTargetMin)-\(repTargetMax)"
    }

    var primaryMuscle: MuscleGroup? {
        muscleMappings.max(by: { $0.coefficient < $1.coefficient })?.muscleGroup
    }

    func mappings(for muscleGroup: MuscleGroup) -> Double {
        muscleMappings.first(where: { $0.muscleGroup == muscleGroup })?.coefficient ?? 0
    }
}
