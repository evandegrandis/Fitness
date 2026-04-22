import Foundation
import SwiftData

@Model
final class UserSettings {
    var usesKilograms: Bool
    var defaultSmallestIncrement: Double
    var defaultRestTimerSeconds: Int
    var defaultRepTargetMin: Int
    var defaultRepTargetMax: Int
    var userName: String
    var supersetRestSeconds: Int

    init(
        usesKilograms: Bool = true,
        defaultSmallestIncrement: Double = 2.5,
        defaultRestTimerSeconds: Int = 120,
        defaultRepTargetMin: Int = 8,
        defaultRepTargetMax: Int = 12,
        userName: String = "Evan",
        supersetRestSeconds: Int = 180
    ) {
        self.usesKilograms = usesKilograms
        self.defaultSmallestIncrement = defaultSmallestIncrement
        self.defaultRestTimerSeconds = defaultRestTimerSeconds
        self.defaultRepTargetMin = defaultRepTargetMin
        self.defaultRepTargetMax = defaultRepTargetMax
        self.userName = userName
        self.supersetRestSeconds = supersetRestSeconds
    }

    var unitLabel: String { usesKilograms ? "kg" : "lb" }
}

@Model
final class RecoveryCheckin {
    @Attribute(.unique) var id: UUID
    var date: Date
    var tookCreatine: Bool
    var proteinTargetMet: Bool
    var sleepHours: Double

    init(
        id: UUID = UUID(),
        date: Date,
        tookCreatine: Bool,
        proteinTargetMet: Bool,
        sleepHours: Double
    ) {
        self.id = id
        self.date = date
        self.tookCreatine = tookCreatine
        self.proteinTargetMet = proteinTargetMet
        self.sleepHours = sleepHours
    }
}
