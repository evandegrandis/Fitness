import SwiftUI
import SwiftData
import UniformTypeIdentifiers
import UIKit

struct SettingsView: View {
    @Environment(\.modelContext) private var modelContext
    @Environment(\.dismiss) private var dismiss
    @Query private var settingsArray: [UserSettings]
    @Query private var goals: [MuscleGoal]
    @Query(sort: \Exercise.name) private var exercises: [Exercise]

    @State private var showImportPicker = false
    @State private var showImportConfirm = false
    @State private var importData: Data?
    @State private var alertMessage = ""
    @State private var showAlert = false
    @AppStorage("icloud_auto_backup_enabled") private var iCloudAutoBackupEnabled: Bool = true

    private var settings: UserSettings {
        if let existing = settingsArray.first { return existing }
        let new = UserSettings()
        modelContext.insert(new)
        try? modelContext.save()
        return new
    }

    var body: some View {
        NavigationStack {
            Form {
                // Backup section (prominent, at top)
                Section {
                    Button {
                        exportData()
                    } label: {
                        HStack {
                            Image(systemName: "square.and.arrow.up")
                                .foregroundStyle(.blue)
                            VStack(alignment: .leading, spacing: 2) {
                                Text("Exporter")
                                    .foregroundStyle(.primary)
                                Text("Sauvegarder dans Fichiers")
                                    .font(.caption2)
                                    .foregroundStyle(.secondary)
                            }
                        }
                    }

                    Button {
                        showImportPicker = true
                    } label: {
                        HStack {
                            Image(systemName: "square.and.arrow.down")
                                .foregroundStyle(.green)
                            VStack(alignment: .leading, spacing: 2) {
                                Text("Importer")
                                    .foregroundStyle(.primary)
                                Text("Restaurer depuis un backup")
                                    .font(.caption2)
                                    .foregroundStyle(.secondary)
                            }
                        }
                    }
                } header: {
                    Text("Sauvegarde")
                } footer: {
                    Text("Exporte avant de réinstaller l'app. Les données sont effacées quand le certificat gratuit expire (7 jours).")
                }

                Section(
                    content: {
                        Toggle("Sauvegarde auto", isOn: $iCloudAutoBackupEnabled)
                        Button("Sauvegarder maintenant") {
                            do {
                                try BackupSyncService.backupNow(context: modelContext)
                                alertMessage = "Backup cloud envoyé."
                            } catch {
                                alertMessage = "Backup cloud impossible: \(error.localizedDescription)"
                            }
                            showAlert = true
                        }
                        Button("Vérifier version distante") {
                            let status = BackupSyncService.compareLocalAndRemote(context: modelContext)
                            switch status {
                            case .unavailable(let reason):
                                alertMessage = reason
                            case .upToDate:
                                alertMessage = "Version locale et distante identiques."
                            case .localIsNewer:
                                alertMessage = "La version locale est plus récente."
                            case .remoteIsNewer:
                                alertMessage = "La version distante est plus récente."
                            }
                            showAlert = true
                        }
                        Button("Restaurer si cloud plus récent") {
                            do {
                                let imported = try BackupSyncService.importRemoteIfNewer(context: modelContext)
                                alertMessage = imported
                                    ? "Données cloud importées (plus récentes)."
                                    : "Aucune version cloud plus récente trouvée."
                            } catch {
                                alertMessage = "Import cloud impossible: \(error.localizedDescription)"
                            }
                            showAlert = true
                        }
                    },
                    header: {
                        Text("Sauvegarde cloud (iCloud)")
                    },
                    footer: {
                        Text("Le backup cloud reste indépendant de l'affichage local : l'app lit SwiftData en local, iCloud sert uniquement de sauvegarde.")
                    }
                )

                Section {
                    HStack {
                        Text("Prénom")
                        Spacer()
                        TextField("Nom", text: Bindable(settings).userName)
                            .multilineTextAlignment(.trailing)
                            .foregroundStyle(.secondary)
                    }
                } header: {
                    Text("Profil")
                }

                Section {
                    Toggle("Kilogrammes", isOn: Bindable(settings).usesKilograms)

                    HStack {
                        Text("Incrément par défaut")
                        Spacer()
                        Text("\(settings.defaultSmallestIncrement.cleanWeight) \(settings.unitLabel)")
                            .foregroundStyle(.secondary)
                        Stepper("", value: Bindable(settings).defaultSmallestIncrement, in: 0.5...10, step: 0.5)
                            .labelsHidden()
                    }
                } header: {
                    Text("Unités")
                }

                Section {
                    Stepper("Par défaut : \(settings.defaultRestTimerSeconds)s",
                            value: Bindable(settings).defaultRestTimerSeconds,
                            in: 30...600,
                            step: 15)
                    Stepper("Superset : \(settings.supersetRestSeconds)s",
                            value: Bindable(settings).supersetRestSeconds,
                            in: 60...600,
                            step: 15)
                } header: {
                    Text("Repos")
                }

                Section {
                    Stepper("Min : \(settings.defaultRepTargetMin)",
                            value: Bindable(settings).defaultRepTargetMin,
                            in: 1...50)
                    Stepper("Max : \(settings.defaultRepTargetMax)",
                            value: Bindable(settings).defaultRepTargetMax,
                            in: 1...50)
                } header: {
                    Text("Reps par défaut")
                }

                Section {
                    ForEach(MuscleParent.allCases) { parent in
                        ParentGoalRow(parent: parent, goals: goals, modelContext: modelContext)
                    }
                } header: {
                    Text("Objectifs hebdo (sets)")
                }
                .task(id: goals.count) {
                    // Ensure every MuscleParent has a backing goal row the first time
                    // Settings is opened — previously each row self-seeded in onAppear,
                    // which raced with SwiftData and could drop edits under fast scroll.
                    let existing = Set(goals.map(\.parent))
                    var inserted = false
                    for parent in MuscleParent.allCases where !existing.contains(parent) {
                        modelContext.insert(MuscleGoal(parent: parent, weeklyGoalSets: 0))
                        inserted = true
                    }
                    if inserted { try? modelContext.save() }
                }

                Section {
                    NavigationLink("Gérer les exercices (\(exercises.count))") {
                        ExerciseManagementView()
                    }
                } header: {
                    Text("Exercices")
                }
            }
            .navigationTitle("Réglages")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button("OK") {
                        try? modelContext.save()
                        dismiss()
                    }
                }
            }
            .fileImporter(
                isPresented: $showImportPicker,
                allowedContentTypes: [.json],
                allowsMultipleSelection: false
            ) { result in
                handleImportFile(result)
            }
            .alert("Importer le backup ?", isPresented: $showImportConfirm) {
                Button("Importer", role: .destructive) {
                    performImport()
                }
                Button("Annuler", role: .cancel) {}
            } message: {
                Text("Toutes les données actuelles seront remplacées. Cette action est irréversible.")
            }
            .alert(alertMessage, isPresented: $showAlert) {
                Button("OK") {}
            }
        }
    }

    // MARK: - Export

    private func exportData() {
        do {
            let jsonData = try DataExporter.exportAll(context: modelContext)
            let fileName = DataExporter.defaultFileName()
            let tempURL = FileManager.default.temporaryDirectory.appendingPathComponent(fileName)
            try jsonData.write(to: tempURL)

            guard let scene = UIApplication.shared.connectedScenes.first as? UIWindowScene,
                  let root = scene.windows.first(where: { $0.isKeyWindow })?.rootViewController else {
                alertMessage = "Impossible d'ouvrir le partage."
                showAlert = true
                return
            }
            var topVC = root
            while let presented = topVC.presentedViewController {
                topVC = presented
            }
            let vc = UIActivityViewController(activityItems: [tempURL], applicationActivities: nil)
            if let pop = vc.popoverPresentationController {
                pop.sourceView = topVC.view
                pop.sourceRect = CGRect(x: topVC.view.bounds.midX, y: topVC.view.bounds.midY, width: 0, height: 0)
                pop.permittedArrowDirections = []
            }
            topVC.present(vc, animated: true)
        } catch {
            alertMessage = "Export failed: \(error.localizedDescription)"
            showAlert = true
        }
    }

    // MARK: - Import

    private func handleImportFile(_ result: Result<[URL], Error>) {
        switch result {
        case .success(let urls):
            guard let url = urls.first else { return }
            guard url.startAccessingSecurityScopedResource() else {
                alertMessage = "Cannot access file."
                showAlert = true
                return
            }
            defer { url.stopAccessingSecurityScopedResource() }

            do {
                importData = try Data(contentsOf: url)
                showImportConfirm = true
            } catch {
                alertMessage = "Cannot read file: \(error.localizedDescription)"
                showAlert = true
            }
        case .failure(let error):
            alertMessage = "File picker error: \(error.localizedDescription)"
            showAlert = true
        }
    }

    private func performImport() {
        guard let data = importData else { return }
        do {
            try DataExporter.importAll(data: data, context: modelContext)
            alertMessage = "Backup restauré avec succès !"
            showAlert = true
        } catch {
            alertMessage = "Import failed: \(error.localizedDescription)"
            showAlert = true
        }
    }
}

// MARK: - Parent Goal Row

struct ParentGoalRow: View {
    let parent: MuscleParent
    let goals: [MuscleGoal]
    let modelContext: ModelContext

    /// Look up the goal on every render rather than caching in @State. Caching
    /// a @Model reference in @State bypasses SwiftUI field-level observation,
    /// so the read-only "N sets" label would never refresh after the stepper
    /// mutated `weeklyGoalSets` — and consumers (Weekly Priority, Progress)
    /// would show stale targets until the next app launch.
    private var goal: MuscleGoal? {
        goals.first(where: { $0.parent == parent })
    }

    var body: some View {
        HStack {
            Text(parent.displayName)
                .font(.subheadline)
            Spacer()
            if let goal {
                Text("\(goal.weeklyGoalSets, specifier: "%.0f") sets")
                    .font(.caption)
                    .foregroundStyle(.secondary)
                Stepper("", value: Bindable(goal).weeklyGoalSets, in: 0...40, step: 1)
                    .labelsHidden()
                    .onChange(of: goal.weeklyGoalSets) {
                        // Persist immediately so downstream @Query consumers
                        // (progress chips, status line) pick up the change.
                        try? modelContext.save()
                    }
            } else {
                Text("0 sets")
                    .font(.caption)
                    .foregroundStyle(.secondary)
                Button("+") {
                    let new = MuscleGoal(parent: parent, weeklyGoalSets: 0)
                    modelContext.insert(new)
                    try? modelContext.save()
                }
                .font(.caption)
            }
        }
    }
}

// MARK: - Exercise Management

struct ExerciseManagementView: View {
    @Query(sort: \Exercise.name) private var exercises: [Exercise]
    @Environment(\.modelContext) private var modelContext

    var body: some View {
        List {
            ForEach(exercises) { exercise in
                NavigationLink {
                    ExerciseDetailView(exercise: exercise)
                } label: {
                    HStack {
                        VStack(alignment: .leading, spacing: 2) {
                            HStack(spacing: 4) {
                                Text(exercise.name)
                                    .font(.subheadline)
                                if exercise.isFavorite {
                                    Image(systemName: "star.fill")
                                        .font(.caption2)
                                        .foregroundStyle(.yellow)
                                }
                            }
                            Text(exercise.setPatternMode.displayName)
                                .font(.caption)
                                .foregroundStyle(.secondary)
                        }
                        Spacer()
                        if let primary = exercise.primaryMuscle {
                            Text(primary.displayName)
                                .font(.caption2)
                                .foregroundStyle(Color.accentColor)
                        }
                    }
                }
            }
            .onDelete { indexSet in
                for index in indexSet {
                    modelContext.delete(exercises[index])
                }
                try? modelContext.save()
            }
        }
        .navigationTitle("Exercices")
        .navigationBarTitleDisplayMode(.inline)
    }
}

struct ExerciseDetailView: View {
    @Bindable var exercise: Exercise
    @Environment(\.modelContext) private var modelContext

    var body: some View {
        Form {
            Section {
                TextField("Nom", text: $exercise.name)
                Toggle("Favori", isOn: $exercise.isFavorite)
                Picker("Pattern", selection: $exercise.setPatternMode) {
                    ForEach(SetPatternMode.allCases) { mode in
                        Text(mode.displayName).tag(mode)
                    }
                }
            } header: {
                Text("Détails")
            }

            Section {
                TextField("Réglage (ex: r4-5)", text: $exercise.machineSetting)
                TextField("Notes setup", text: $exercise.setupNotes)
            } header: {
                Text("Machine")
            }

            Section {
                Stepper("Min : \(exercise.repTargetMin)", value: $exercise.repTargetMin, in: 1...50)
                Stepper("Max : \(exercise.repTargetMax)", value: $exercise.repTargetMax, in: 1...50)
                Stepper("Incrément : \(exercise.smallestIncrement.cleanWeight)",
                        value: $exercise.smallestIncrement, in: 0.5...20, step: 0.5)
            } header: {
                Text("Reps")
            }

            Section {
                Stepper("Repos : \(exercise.suggestedRestSeconds)s",
                        value: $exercise.suggestedRestSeconds, in: 30...600, step: 15)
            } header: {
                Text("Repos")
            }

            Section {
                ForEach(exercise.muscleMappings) { mapping in
                    HStack {
                        Text(mapping.muscleGroup.displayName)
                        Spacer()
                        Text("\(mapping.coefficient, specifier: "%.1f")")
                            .foregroundStyle(Color.accentColor)
                    }
                }

                Button("Ajouter un muscle") {
                    let mapping = MuscleMapping(muscleGroup: .pectStern, coefficient: 0.3)
                    mapping.exercise = exercise
                    modelContext.insert(mapping)
                    exercise.muscleMappings.append(mapping)
                }
            } header: {
                Text("Muscles")
            }
        }
        .navigationTitle(exercise.name)
        .navigationBarTitleDisplayMode(.inline)
    }
}
