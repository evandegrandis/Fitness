import Foundation
import SwiftData

@Model
final class WorkoutTemplate {
    @Attribute(.unique) var id: UUID
    var name: String
    var createdAt: Date
    var sortOrder: Int

    @Relationship(deleteRule: .cascade) var templateExercises: [TemplateExercise]

    init(
        id: UUID = UUID(),
        name: String,
        createdAt: Date = Date(),
        sortOrder: Int = 0,
        templateExercises: [TemplateExercise] = []
    ) {
        self.id = id
        self.name = name
        self.createdAt = createdAt
        self.sortOrder = sortOrder
        self.templateExercises = templateExercises
    }

    var orderedExercises: [TemplateExercise] {
        templateExercises.sorted { $0.orderIndex < $1.orderIndex }
    }
}

@Model
final class TemplateExercise {
    var orderIndex: Int
    @Relationship var exercise: Exercise?
    var targetSets: Int

    init(orderIndex: Int, exercise: Exercise? = nil, targetSets: Int = 3) {
        self.orderIndex = orderIndex
        self.exercise = exercise
        self.targetSets = targetSets
    }
}
