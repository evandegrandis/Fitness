import Foundation
import SwiftData

@Model
final class UserSettings {
    var usesKilograms: Bool
    var defaultSmallestIncrement: Double
    var defaultRestTimerSeconds: Int
    var defaultRepTargetMin: Int
    var defaultRepTargetMax: Int

    init(
        usesKilograms: Bool = true,
        defaultSmallestIncrement: Double = 2.5,
        defaultRestTimerSeconds: Int = 120,
        defaultRepTargetMin: Int = 8,
        defaultRepTargetMax: Int = 12
    ) {
        self.usesKilograms = usesKilograms
        self.defaultSmallestIncrement = defaultSmallestIncrement
        self.defaultRestTimerSeconds = defaultRestTimerSeconds
        self.defaultRepTargetMin = defaultRepTargetMin
        self.defaultRepTargetMax = defaultRepTargetMax
    }

    var unitLabel: String { usesKilograms ? "kg" : "lb" }
}
