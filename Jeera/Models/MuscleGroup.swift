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

    // Dos haut (upper back)
    case trapSup      = "trap_sup"
    case trapMid      = "trap_mid"
    case trapInf      = "trap_inf"
    case rhomboides   = "rhomboides"

    // Grand dorsal (lats)
    case latSup       = "lat_sup"
    case latInf       = "lat_inf"

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

    // Abdos
    case absHaut      = "abs_haut"
    case absBas       = "abs_bas"
    case transverse   = "transverse"

    // Obliques
    case obliqueExt   = "oblique_ext"
    case obliqueInt   = "oblique_int"

    // Avant-bras
    case flechisseurs = "flechisseurs"
    case extenseurs   = "extenseurs"
    case brachioradial = "brachioradial"

    // Quadriceps
    case vasteLat     = "vaste_lat"
    case vasteMed     = "vaste_med"
    case droitFemoral = "droit_femoral"

    // Ischios (hamstrings)
    case bicepsFemoral = "biceps_femoral"
    case semiTendineux = "semi_tendineux"

    // Fessiers (glutes)
    case glutMax      = "glut_max"
    case glutMed      = "glut_med"

    var id: String { rawValue }

    var parent: MuscleParent {
        switch self {
        case .pectClav, .pectStern:
            return .pectoraux
        case .trapSup, .trapMid, .trapInf, .rhomboides:
            return .dosHaut
        case .latSup, .latInf:
            return .grandDorsal
        case .deltAnt, .deltLat, .deltPost:
            return .deltoides
        case .bicepsLong, .bicepsCourt:
            return .biceps
        case .tricepsLong, .tricepsLat, .tricepsMed:
            return .triceps
        case .absHaut, .absBas, .transverse:
            return .abs
        case .obliqueExt, .obliqueInt:
            return .obliques
        case .flechisseurs, .extenseurs, .brachioradial:
            return .forearms
        case .vasteLat, .vasteMed, .droitFemoral:
            return .quads
        case .bicepsFemoral, .semiTendineux:
            return .hamstrings
        case .glutMax, .glutMed:
            return .glutes
        }
    }

    var displayName: String {
        switch self {
        case .pectClav:       return "Pectoraux claviculaires"
        case .pectStern:      return "Pectoraux sternaux"
        case .trapSup:        return "Trapèze supérieur"
        case .trapMid:        return "Trapèze moyen"
        case .trapInf:        return "Trapèze inférieur"
        case .rhomboides:     return "Rhomboïdes"
        case .latSup:         return "Grand dorsal supérieur"
        case .latInf:         return "Grand dorsal inférieur"
        case .deltAnt:        return "Deltoïde antérieur"
        case .deltLat:        return "Deltoïde latéral"
        case .deltPost:       return "Deltoïde postérieur"
        case .bicepsLong:     return "Biceps chef long"
        case .bicepsCourt:    return "Biceps chef court"
        case .tricepsLong:    return "Triceps chef long"
        case .tricepsLat:     return "Triceps vaste latéral"
        case .tricepsMed:     return "Triceps vaste médial"
        case .absHaut:        return "Abdos supérieurs"
        case .absBas:         return "Abdos inférieurs"
        case .transverse:     return "Transverse"
        case .obliqueExt:     return "Oblique externe"
        case .obliqueInt:     return "Oblique interne"
        case .flechisseurs:   return "Fléchisseurs"
        case .extenseurs:     return "Extenseurs"
        case .brachioradial:  return "Brachio-radial"
        case .vasteLat:       return "Vaste latéral"
        case .vasteMed:       return "Vaste médial"
        case .droitFemoral:   return "Droit fémoral"
        case .bicepsFemoral:  return "Biceps fémoral"
        case .semiTendineux:  return "Semi-tendineux"
        case .glutMax:        return "Grand fessier"
        case .glutMed:        return "Moyen fessier"
        }
    }

    /// Very short label used in cramped chips.
    var shortName: String {
        switch self {
        case .pectClav:       return "Pec clav"
        case .pectStern:      return "Pec stern"
        case .trapSup:        return "Trap sup"
        case .trapMid:        return "Trap mid"
        case .trapInf:        return "Trap inf"
        case .rhomboides:     return "Rhomb"
        case .latSup:         return "Lat sup"
        case .latInf:         return "Lat inf"
        case .deltAnt:        return "Delt ant"
        case .deltLat:        return "Delt lat"
        case .deltPost:       return "Delt post"
        case .bicepsLong:     return "Bic long"
        case .bicepsCourt:    return "Bic court"
        case .tricepsLong:    return "Tri long"
        case .tricepsLat:     return "Tri lat"
        case .tricepsMed:     return "Tri méd"
        case .absHaut:        return "Abs haut"
        case .absBas:         return "Abs bas"
        case .transverse:     return "Transv"
        case .obliqueExt:     return "Obl ext"
        case .obliqueInt:     return "Obl int"
        case .flechisseurs:   return "Fléch"
        case .extenseurs:     return "Ext"
        case .brachioradial:  return "Brach-rad"
        case .vasteLat:       return "V. lat"
        case .vasteMed:       return "V. méd"
        case .droitFemoral:   return "Dr. fém"
        case .bicepsFemoral:  return "Bi. fém"
        case .semiTendineux:  return "Semi-t"
        case .glutMax:        return "Gd fess"
        case .glutMed:        return "Moy fess"
        }
    }

    var icon: String {
        switch parent {
        case .pectoraux:              return "figure.strengthtraining.traditional"
        case .deltoides:              return "figure.arms.open"
        case .triceps:                return "figure.boxing"
        case .biceps:                 return "figure.strengthtraining.functional"
        case .forearms:               return "hand.raised.fill"
        case .dosHaut, .grandDorsal:  return "figure.rowing"
        case .quads, .hamstrings, .glutes: return "figure.walk"
        case .abs, .obliques:         return "figure.core.training"
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
        self = .absHaut
    }

    /// Map of known legacy raw strings → current leaves.
    /// Legacy generic groups get split onto the most representative leaf.
    static let legacyMapping: [String: MuscleGroup] = [
        // Pre-MECE coarse groups
        "chest":        .pectStern,
        "upper_back":   .trapMid,
        "upperback":    .trapMid,
        "lats":         .latSup,
        "biceps":       .bicepsCourt,
        "triceps":      .tricepsLong,
        "shoulders":    .deltLat,
        "side_delts":   .deltLat,
        "front_delts":  .deltAnt,
        "rear_delts":   .deltPost,
        "calves":       .vasteLat,   // calves removed from taxonomy
        "back":         .trapMid,
        "legs":         .vasteLat,
        "core":         .absHaut,

        // Previous single-leaf raw values (v2 → v3 migration)
        "dos_haut":     .trapMid,
        "grand_dorsal": .latSup,
        "abs":          .absHaut,
        "obliques":     .obliqueExt,
        "avant_bras":   .flechisseurs,
        "quads":        .vasteLat,
        "ischios":      .bicepsFemoral,
        "fessiers":     .glutMax,
    ]
}
