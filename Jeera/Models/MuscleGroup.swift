import Foundation

// MARK: - Parent taxonomy (summary groups)

/// High-level muscle groups used for summary views and weekly goals.
/// These are the "buckets" the user thinks in on the home screen and settings.
enum MuscleParent: String, CaseIterable, Identifiable, Codable, Comparable {
    case pectoraux
    case dosHaut = "dos_haut"
    case grandDorsal = "grand_dorsal"
    case deltoides
    case biceps
    case triceps
    case abs
    case obliques
    case forearms = "avant_bras"
    case quads
    case hamstrings = "ischios"
    case glutes = "fessiers"

    var id: String { rawValue }

    var displayName: String {
        switch self {
        case .pectoraux:    return "Pectoraux"
        case .dosHaut:      return "Dos haut"
        case .grandDorsal:  return "Grand dorsal"
        case .deltoides:    return "Deltoïdes"
        case .biceps:       return "Biceps"
        case .triceps:      return "Triceps"
        case .abs:          return "Abdos"
        case .obliques:     return "Obliques"
        case .forearms:     return "Avant-bras"
        case .quads:        return "Quadriceps"
        case .hamstrings:   return "Ischios"
        case .glutes:       return "Fessiers"
        }
    }

    var shortName: String {
        switch self {
        case .pectoraux:    return "Pecs"
        case .dosHaut:      return "Dos haut"
        case .grandDorsal:  return "Dorsaux"
        case .deltoides:    return "Delts"
        case .biceps:       return "Biceps"
        case .triceps:      return "Triceps"
        case .abs:          return "Abdos"
        case .obliques:     return "Obliques"
        case .forearms:     return "Av-bras"
        case .quads:        return "Quads"
        case .hamstrings:   return "Ischios"
        case .glutes:       return "Fessiers"
        }
    }

    static func < (lhs: MuscleParent, rhs: MuscleParent) -> Bool {
        lhs.displayName < rhs.displayName
    }
}

// MARK: - Leaf taxonomy (MECE precision)

/// MECE leaf-level muscle classification. Every exercise is mapped at this
/// level. Summary views aggregate up to `MuscleParent` when they need a
/// compact picture.
///
/// Raw values are stable — the legacy `init(from:)` migrates pre-split store
/// strings ("chest", "shoulders", "biceps"…) into the appropriate leaf
/// without crashing SwiftData.
enum MuscleGroup: String, Codable, CaseIterable, Identifiable, Comparable {
    // Pectoraux
    case pectClav     = "pect_clav"
    case pectStern    = "pect_stern"

    // Dos
    case dosHaut      = "dos_haut"
    case grandDorsal  = "grand_dorsal"

    // Deltoïdes
    case deltAnt      = "delt_ant"
    case deltLat      = "delt_lat"
    case deltPost     = "delt_post"

    // Biceps
    case bicepsLong   = "biceps_long"
    case bicepsCourt  = "biceps_court"

    // Triceps
    case tricepsLong  = "triceps_long"
    case tricepsLat   = "triceps_lat"
    case tricepsMed   = "triceps_med"

    // Core / distal
    case abs
    case obliques
    case forearms     = "avant_bras"

    // Lower body
    case quads
    case hamstrings   = "ischios"
    case glutes       = "fessiers"

    var id: String { rawValue }

    var parent: MuscleParent {
        switch self {
        case .pectClav, .pectStern:           return .pectoraux
        case .dosHaut:                        return .dosHaut
        case .grandDorsal:                    return .grandDorsal
        case .deltAnt, .deltLat, .deltPost:   return .deltoides
        case .bicepsLong, .bicepsCourt:       return .biceps
        case .tricepsLong, .tricepsLat, .tricepsMed:
                                              return .triceps
        case .abs:                            return .abs
        case .obliques:                       return .obliques
        case .forearms:                       return .forearms
        case .quads:                          return .quads
        case .hamstrings:                     return .hamstrings
        case .glutes:                         return .glutes
        }
    }

    var displayName: String {
        switch self {
        case .pectClav:     return "Pectoraux claviculaires"
        case .pectStern:    return "Pectoraux sternaux"
        case .dosHaut:      return "Dos haut"
        case .grandDorsal:  return "Grand dorsal"
        case .deltAnt:      return "Deltoïde antérieur"
        case .deltLat:      return "Deltoïde latéral"
        case .deltPost:     return "Deltoïde postérieur"
        case .bicepsLong:   return "Biceps chef long"
        case .bicepsCourt:  return "Biceps chef court"
        case .tricepsLong:  return "Triceps chef long"
        case .tricepsLat:   return "Triceps vaste latéral"
        case .tricepsMed:   return "Triceps vaste médial"
        case .abs:          return "Abdos"
        case .obliques:     return "Obliques"
        case .forearms:     return "Avant-bras"
        case .quads:        return "Quadriceps"
        case .hamstrings:   return "Ischios"
        case .glutes:       return "Fessiers"
        }
    }

    /// Very short label used in cramped chips.
    var shortName: String {
        switch self {
        case .pectClav:     return "Pec clav"
        case .pectStern:    return "Pec stern"
        case .dosHaut:      return "Dos haut"
        case .grandDorsal:  return "Dorsaux"
        case .deltAnt:      return "Delt ant"
        case .deltLat:      return "Delt lat"
        case .deltPost:     return "Delt post"
        case .bicepsLong:   return "Bic long"
        case .bicepsCourt:  return "Bic court"
        case .tricepsLong:  return "Tri long"
        case .tricepsLat:   return "Tri lat"
        case .tricepsMed:   return "Tri méd"
        case .abs:          return "Abdos"
        case .obliques:     return "Obliques"
        case .forearms:     return "Av-bras"
        case .quads:        return "Quads"
        case .hamstrings:   return "Ischios"
        case .glutes:       return "Fessiers"
        }
    }

    var icon: String {
        switch parent {
        case .pectoraux:    return "figure.strengthtraining.traditional"
        case .deltoides:    return "figure.arms.open"
        case .triceps:      return "figure.boxing"
        case .biceps:       return "figure.strengthtraining.functional"
        case .forearms:     return "hand.raised.fill"
        case .dosHaut, .grandDorsal: return "figure.rowing"
        case .quads, .hamstrings, .glutes: return "figure.walk"
        case .abs, .obliques: return "figure.core.training"
        }
    }

    static func < (lhs: MuscleGroup, rhs: MuscleGroup) -> Bool {
        lhs.displayName < rhs.displayName
    }

    // MARK: - Legacy-aware decoding

    /// Decode from the persisted raw string. If the raw value is from an
    /// older schema, map it to the closest sensible leaf so SwiftData can
    /// load the store without crashing.
    init(from decoder: Decoder) throws {
        let container = try decoder.singleValueContainer()
        let raw = try container.decode(String.self)
        if let match = MuscleGroup(rawValue: raw) {
            self = match
            return
        }
        if let migrated = Self.legacyMapping[raw] {
            self = migrated
            return
        }
        // Never crash on unknown raw values — default to a harmless leaf.
        self = .abs
    }

    /// Map of known legacy raw strings → current leaves.
    /// Legacy generic groups get split onto the most representative leaf.
    static let legacyMapping: [String: MuscleGroup] = [
        // Pre-MECE coarse groups
        "chest":        .pectStern,
        "upper_back":   .dosHaut,
        "upperback":    .dosHaut,
        "lats":         .grandDorsal,
        "biceps":       .bicepsCourt,
        "triceps":      .tricepsLong,
        "shoulders":    .deltLat,
        "side_delts":   .deltLat,
        "front_delts":  .deltAnt,
        "rear_delts":   .deltPost,
        "calves":       .quads,      // calves removed from taxonomy
        "back":         .dosHaut,
        "legs":         .quads,
        "core":         .abs
    ]
}
