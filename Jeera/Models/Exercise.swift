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

    /// Reference lower-bound load for the benchmark band on progress charts.
    /// Framed as "average score of a ~25-year-old man training for 1 year".
    /// Optional — only exercises with meaningful benchmarks expose a band.
    var benchmarkLow: Double?
    /// Reference upper bound — "what is naturally achievable on this exercise".
    var benchmarkHigh: Double?

    /// Systemic fatigue class. Governs how aggressively the engine predicts
    /// rep drop across successive working sets at the same load.
    ///   H = heavy compound / weighted bodyweight (~2 rep drop)
    ///   M = stable machine compound (~1.5 rep drop)
    ///   L = isolation / forearms / abs (~1 rep drop)
    var fatigueClass: FatigueClass = FatigueClass.medium

    /// Controls how the progression engine behaves on plateau and set 2 decisions.
    /// Stored as optional so existing SwiftData rows migrate without crashing.
    /// nil is treated as .generic everywhere.
    var progressionPolicy: ProgressionPolicy?
    /// When progressionPolicy == .voluntaryCap, suggestions never exceed this rep count.
    /// 0 = disabled.
    var voluntaryRepCap: Int = 0

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
        benchmarkLow: Double? = nil,
        benchmarkHigh: Double? = nil,
        fatigueClass: FatigueClass = .medium,
        progressionPolicy: ProgressionPolicy? = nil,
        voluntaryRepCap: Int = 0,
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
        self.benchmarkLow = benchmarkLow
        self.benchmarkHigh = benchmarkHigh
        self.fatigueClass = fatigueClass
        self.progressionPolicy = progressionPolicy
        self.voluntaryRepCap = voluntaryRepCap
        self.muscleMappings = muscleMappings
    }

    var isBigExercise: Bool { suggestedRestSeconds >= 150 }

    var repTargetDisplay: String {
        if repTargetMin == repTargetMax {
            return "\(repTargetMin)"
        }
        return "\(repTargetMin)-\(repTargetMax)"
    }

    /// Primary leaf muscle (highest-coefficient mapping).
    var primaryMuscle: MuscleGroup? {
        muscleMappings.max(by: { $0.coefficient < $1.coefficient })?.muscleGroup
    }

    /// Parent-level primary muscle, used for filtering / suggestions.
    var primaryParent: MuscleParent? { primaryMuscle?.parent }

    func mappings(for muscleGroup: MuscleGroup) -> Double {
        muscleMappings.first(where: { $0.muscleGroup == muscleGroup })?.coefficient ?? 0
    }

    /// Aggregate coefficient for a parent group (sum of all leaves that belong
    /// to the same parent). Used by the rolling coverage engine so a
    /// chest-press set counts toward the "Pectoraux" parent just once.
    func aggregateCoefficient(for parent: MuscleParent) -> Double {
        muscleMappings
            .filter { $0.muscleGroup.parent == parent }
            .map(\.coefficient)
            .max() ?? 0
    }
}
