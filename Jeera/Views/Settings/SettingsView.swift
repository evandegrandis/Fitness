import SwiftUI
import SwiftData
import UniformTypeIdentifiers

struct SettingsView: View {
    @Environment(\.modelContext) private var modelContext
    @Environment(\.dismiss) private var dismiss
    @Query private var settingsArray: [UserSettings]
    @Query private var goals: [MuscleGoal]
    @Query(sort: \Exercise.name) private var exercises: [Exercise]

    @State private var showExportShare = false
    @State private var exportURL: URL?
    @State private var showImportPicker = false
    @State private var showImportConfirm = false
    @State private var importData: Data?
    @State private var alertMessage = ""
    @State private var showAlert = false
    @State private var lastExportDate: String = ""

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
                                Text("Export Backup")
                                    .foregroundStyle(.primary)
                                Text("Save all data to Files")
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
                                Text("Import Backup")
                                    .foregroundStyle(.primary)
                                Text("Restore from a backup file")
                                    .font(.caption2)
                                    .foregroundStyle(.secondary)
                            }
                        }
                    }
                } header: {
                    Text("Backup & Restore")
                } footer: {
                    Text("Export before reinstalling the app. Your data will be erased when the free certificate expires (7 days).")
                }

                Section("Units") {
                    Toggle("Use Kilograms", isOn: Bindable(settings).usesKilograms)

                    HStack {
                        Text("Default Increment")
                        Spacer()
                        Text("\(settings.defaultSmallestIncrement.cleanWeight) \(settings.unitLabel)")
                            .foregroundStyle(.secondary)
                        Stepper("", value: Bindable(settings).defaultSmallestIncrement, in: 0.5...10, step: 0.5)
                            .labelsHidden()
                    }
                }

                Section("Rest Timer") {
                    Stepper("Default: \(settings.defaultRestTimerSeconds)s",
                            value: Bindable(settings).defaultRestTimerSeconds,
                            in: 30...600,
                            step: 15)
                }

                Section("Default Rep Target") {
                    Stepper("Min: \(settings.defaultRepTargetMin)",
                            value: Bindable(settings).defaultRepTargetMin,
                            in: 1...50)
                    Stepper("Max: \(settings.defaultRepTargetMax)",
                            value: Bindable(settings).defaultRepTargetMax,
                            in: 1...50)
                }

                Section("Weekly Set Goals") {
                    ForEach(MuscleGroup.allCases) { muscle in
                        MuscleGoalRow(muscle: muscle, goals: goals, modelContext: modelContext)
                    }
                }

                Section("Exercises") {
                    NavigationLink("Manage Exercises (\(exercises.count))") {
                        ExerciseManagementView()
                    }
                }
            }
            .navigationTitle("Settings")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button("Done") {
                        try? modelContext.save()
                        dismiss()
                    }
                }
            }
            .sheet(isPresented: $showExportShare) {
                if let url = exportURL {
                    ShareSheet(activityItems: [url])
                }
            }
            .fileImporter(
                isPresented: $showImportPicker,
                allowedContentTypes: [.json],
                allowsMultipleSelection: false
            ) { result in
                handleImportFile(result)
            }
            .alert("Import Backup?", isPresented: $showImportConfirm) {
                Button("Import", role: .destructive) {
                    performImport()
                }
                Button("Cancel", role: .cancel) {}
            } message: {
                Text("This will replace ALL current data with the backup. This cannot be undone.")
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
            exportURL = tempURL
            showExportShare = true
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
            alertMessage = "Backup restored successfully!"
            showAlert = true
        } catch {
            alertMessage = "Import failed: \(error.localizedDescription)"
            showAlert = true
        }
    }
}

// MARK: - Share Sheet (UIKit wrapper)

struct ShareSheet: UIViewControllerRepresentable {
    let activityItems: [Any]

    func makeUIViewController(context: Context) -> UIActivityViewController {
        UIActivityViewController(activityItems: activityItems, applicationActivities: nil)
    }

    func updateUIViewController(_ uiViewController: UIActivityViewController, context: Context) {}
}

// MARK: - Muscle Goal Row

struct MuscleGoalRow: View {
    let muscle: MuscleGroup
    let goals: [MuscleGoal]
    let modelContext: ModelContext
    @State private var resolvedGoal: MuscleGoal?

    private var goalSets: Double {
        resolvedGoal?.weeklyGoalSets ?? goals.first(where: { $0.muscleGroup == muscle })?.weeklyGoalSets ?? 0
    }

    var body: some View {
        HStack {
            Text(muscle.displayName)
                .font(.subheadline)
            Spacer()
            Text("\(goalSets, specifier: "%.0f") sets")
                .font(.caption)
                .foregroundStyle(.secondary)
            if let goal = resolvedGoal {
                Stepper("", value: Bindable(goal).weeklyGoalSets, in: 0...40, step: 1)
                    .labelsHidden()
            } else {
                Stepper("", value: .constant(0.0), in: 0...40, step: 1)
                    .labelsHidden()
            }
        }
        .onAppear {
            if resolvedGoal == nil {
                if let existing = goals.first(where: { $0.muscleGroup == muscle }) {
                    resolvedGoal = existing
                } else {
                    let new = MuscleGoal(muscleGroup: muscle, weeklyGoalSets: 0)
                    modelContext.insert(new)
                    try? modelContext.save()
                    resolvedGoal = new
                }
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
        .navigationTitle("Exercises")
        .navigationBarTitleDisplayMode(.inline)
    }
}

struct ExerciseDetailView: View {
    @Bindable var exercise: Exercise
    @Environment(\.modelContext) private var modelContext

    var body: some View {
        Form {
            Section("Details") {
                TextField("Name", text: $exercise.name)
                Toggle("Favorite", isOn: $exercise.isFavorite)
                Picker("Pattern", selection: $exercise.setPatternMode) {
                    ForEach(SetPatternMode.allCases) { mode in
                        Text(mode.displayName).tag(mode)
                    }
                }
            }

            Section("Rep Target") {
                Stepper("Min: \(exercise.repTargetMin)", value: $exercise.repTargetMin, in: 1...50)
                Stepper("Max: \(exercise.repTargetMax)", value: $exercise.repTargetMax, in: 1...50)
                Stepper("Increment: \(exercise.smallestIncrement.cleanWeight)",
                        value: $exercise.smallestIncrement, in: 0.5...20, step: 0.5)
            }

            Section("Rest Timer") {
                Stepper("Rest: \(exercise.suggestedRestSeconds)s",
                        value: $exercise.suggestedRestSeconds, in: 30...600, step: 15)
            }

            Section("Muscle Mappings") {
                ForEach(exercise.muscleMappings) { mapping in
                    HStack {
                        Text(mapping.muscleGroup.displayName)
                        Spacer()
                        Text("\(mapping.coefficient, specifier: "%.1f")")
                            .foregroundStyle(Color.accentColor)
                    }
                }

                Button("Add Muscle") {
                    let mapping = MuscleMapping(muscleGroup: .chest, coefficient: 0.3)
                    mapping.exercise = exercise
                    modelContext.insert(mapping)
                    exercise.muscleMappings.append(mapping)
                }
            }
        }
        .navigationTitle(exercise.name)
        .navigationBarTitleDisplayMode(.inline)
    }
}
