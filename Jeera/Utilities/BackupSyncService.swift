import Foundation
import SwiftData

enum BackupSyncStatus {
    case unavailable(String)
    case upToDate
    case localIsNewer
    case remoteIsNewer
}

enum BackupSyncService {
    static let autoBackupFileName = "jeera_backup_auto.json"

    private static var iCloudDocsURL: URL? {
        FileManager.default
            .url(forUbiquityContainerIdentifier: nil)?
            .appendingPathComponent("Documents", isDirectory: true)
    }

    static func isAvailable() -> Bool {
        iCloudDocsURL != nil
    }

    static func backupNow(context: ModelContext) throws {
        guard let docs = iCloudDocsURL else {
            throw NSError(domain: "BackupSyncService", code: 1, userInfo: [
                NSLocalizedDescriptionKey: "iCloud Drive indisponible sur cet appareil."
            ])
        }

        try FileManager.default.createDirectory(at: docs, withIntermediateDirectories: true)
        let data = try DataExporter.exportAll(context: context)
        let destination = docs.appendingPathComponent(autoBackupFileName)
        try data.write(to: destination, options: .atomic)
    }

    static func compareLocalAndRemote(context: ModelContext) -> BackupSyncStatus {
        guard let docs = iCloudDocsURL else {
            return .unavailable("iCloud Drive indisponible.")
        }

        let remoteURL = docs.appendingPathComponent(autoBackupFileName)
        guard let remoteData = try? Data(contentsOf: remoteURL) else {
            return .localIsNewer
        }

        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601
        guard let remote = try? decoder.decode(JeeraBackup.self, from: remoteData) else {
            return .localIsNewer
        }

        let localLatest = latestWorkoutDate(context: context)
        let remoteLatest = remote.lastWorkoutLoggedAt ?? remote.exportDate

        if let localLatest {
            if remoteLatest > localLatest { return .remoteIsNewer }
            if remoteLatest < localLatest { return .localIsNewer }
            return .upToDate
        }
        return .upToDate
    }

    static func importRemoteIfNewer(context: ModelContext) throws -> Bool {
        guard let docs = iCloudDocsURL else { return false }
        let remoteURL = docs.appendingPathComponent(autoBackupFileName)
        guard let remoteData = try? Data(contentsOf: remoteURL) else { return false }

        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601
        guard let remote = try? decoder.decode(JeeraBackup.self, from: remoteData) else { return false }

        let localLatest = latestWorkoutDate(context: context)
        let remoteLatest = remote.lastWorkoutLoggedAt ?? remote.exportDate
        guard localLatest == nil || remoteLatest > localLatest! else { return false }

        try DataExporter.importAll(data: remoteData, context: context)
        return true
    }

    static func backupIfLocalIsNewer(context: ModelContext) {
        let defaults = UserDefaults.standard
        let key = "icloud_auto_backup_enabled"
        let enabled = defaults.object(forKey: key) == nil ? true : defaults.bool(forKey: key)
        guard enabled else { return }
        switch compareLocalAndRemote(context: context) {
        case .localIsNewer:
            try? backupNow(context: context)
        default:
            break
        }
    }

    private static func latestWorkoutDate(context: ModelContext) -> Date? {
        let descriptor = FetchDescriptor<WorkoutSession>(
            predicate: #Predicate { !$0.isActive },
            sortBy: [SortDescriptor(\.startTime, order: .reverse)]
        )
        let sessions = (try? context.fetch(descriptor)) ?? []
        return sessions
            .flatMap { $0.loggedExercises }
            .flatMap { $0.completedWorkSets }
            .map(\.timestamp)
            .max() ?? sessions.map(\.startTime).max()
    }
}
