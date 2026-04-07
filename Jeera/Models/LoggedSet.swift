import Foundation
import SwiftData

@Model
final class LoggedSet {
    @Attribute(.unique) var id: UUID
    var weight: Double
    var reps: Int
    var setType: SetType
    var timestamp: Date
    var setSlotIndex: Int
    var completed: Bool

    @Relationship var loggedExercise: LoggedExercise?

    init(
        id: UUID = UUID(),
        weight: Double = 0,
        reps: Int = 0,
        setType: SetType = .work,
        timestamp: Date = Date(),
        setSlotIndex: Int = 0,
        completed: Bool = true
    ) {
        self.id = id
        self.weight = weight
        self.reps = reps
        self.setType = setType
        self.timestamp = timestamp
        self.setSlotIndex = setSlotIndex
        self.completed = completed
    }
}

extension Double {
    var cleanWeight: String {
        if self == floor(self) {
            return String(format: "%.0f", self)
        }
        return String(format: "%.1f", self)
    }
}
