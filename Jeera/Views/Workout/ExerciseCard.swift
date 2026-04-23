import SwiftUI
import SwiftData

struct ExerciseCard: View {
    @Bindable var loggedExercise: LoggedExercise
    @Bindable var viewModel: WorkoutViewModel

    @State private var editWeight: Double = 0
    @State private var editReps: Int = 0
    @State private var hasLoadedSuggestion = false
    @State private var showWeightEntry = false
    @State private var showRepsEntry = false
    @State private var weightText = ""
    @State private var repsText = ""
    @State private var editingSet: LoggedSet?
    @State private var showEditSetAlert = false
    @State private var editSetWeight = ""
    @State private var editSetReps = ""
    @State private var cachedSuggestion = SetSuggestion(weight: 0, reps: 10, setType: .work, explanation: "")
    @State private var showReplacePicker = false

    private var exercise: Exercise? { loggedExercise.exercise }
    private var isArmed: Bool { viewModel.armedSupersetExerciseID == loggedExercise.id }

    private func refreshSuggestion() {
        cachedSuggestion = viewModel.suggestion(for: loggedExercise)
    }

    var body: some View {
        VStack(spacing: 0) {
            GlassCard(padding: 0, cornerRadius: 26) {
                VStack(spacing: 0) {
                    cardHeader
                        .padding(.horizontal, 14)
                        .padding(.top, 9)
                        .padding(.bottom, 4)

                    Divider().background(.white.opacity(0.06))

                    if !loggedExercise.orderedSets.isEmpty {
                        setsSection
                    }

                    inlineEditSection
                        .padding(.horizontal, 14)
                        .padding(.top, 5)
                        .padding(.bottom, 7)
                }
            }
            .overlay {
                if isArmed {
                    RoundedRectangle(cornerRadius: 26, style: .continuous)
                        .stroke(Color.accentColor.opacity(0.7), lineWidth: 1.5)
                        .transition(.opacity)
                }
            }
            .padding(.horizontal, 16)
            .animation(.easeInOut(duration: 0.2), value: isArmed)

            if loggedExercise.isLinkedToNext {
                HStack(spacing: 6) {
                    Rectangle()
                        .fill(Color.accentColor.opacity(0.45))
                        .frame(width: 2, height: 14)
                    Text("Superset")
                        .font(.caption2.weight(.medium))
                        .foregroundStyle(Color.accentColor.opacity(0.75))
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(.leading, 30)
                .padding(.top, 2)
            }
        }
        .swipeActions(edge: .trailing, allowsFullSwipe: false) {
            Button(role: .destructive) {
                withAnimation { viewModel.removeExercise(loggedExercise) }
            } label: {
                Label("Supprimer", systemImage: "trash")
            }
        }
        .swipeActions(edge: .leading, allowsFullSwipe: true) {
            Button {
                withAnimation { viewModel.handleSupersetLink(loggedExercise) }
            } label: {
                Label(
                    loggedExercise.isLinkedToNext ? "Retirer du superset" : "Lier en superset",
                    systemImage: loggedExercise.isLinkedToNext ? "link.badge.plus" : "link"
                )
            }
            .tint(loggedExercise.isLinkedToNext ? .red : .blue)
        }
        .onAppear {
            if !hasLoadedSuggestion {
                refreshSuggestion()
                editWeight = cachedSuggestion.weight
                editReps = cachedSuggestion.reps
                hasLoadedSuggestion = true
            }
        }
        .onChange(of: loggedExercise.sets.count) {
            refreshSuggestion()
            editWeight = cachedSuggestion.weight
            editReps = cachedSuggestion.reps
        }
        .contextMenu {
            Button {
                showReplacePicker = true
            } label: {
                Label("Remplacer", systemImage: "arrow.triangle.2.circlepath")
            }
            Button {
                viewModel.duplicateExercise(loggedExercise)
            } label: {
                Label("Dupliquer", systemImage: "doc.on.doc")
            }
            Button {
                withAnimation { viewModel.handleSupersetLink(loggedExercise) }
            } label: {
                Label(
                    loggedExercise.isLinkedToNext ? "Retirer du superset" : "Lier en superset",
                    systemImage: loggedExercise.isLinkedToNext ? "link.badge.plus" : "link"
                )
            }
            Button(role: .destructive) {
                withAnimation { viewModel.removeExercise(loggedExercise) }
            } label: {
                Label("Supprimer", systemImage: "trash")
            }
        }
        .sheet(isPresented: $showReplacePicker) {
            ExercisePickerView(filterMuscle: exercise?.primaryMuscle) { chosen in
                viewModel.replaceExercise(loggedExercise, with: chosen)
            }
        }
        .alert("Poids (kg)", isPresented: $showWeightEntry) {
            TextField("0", text: $weightText)
                .keyboardType(.decimalPad)
            Button("OK") {
                if let val = Double(weightText.replacingOccurrences(of: ",", with: ".")) {
                    editWeight = val
                }
            }
            Button("Annuler", role: .cancel) {}
        }
        .alert("Reps", isPresented: $showRepsEntry) {
            TextField("0", text: $repsText)
                .keyboardType(.numberPad)
            Button("OK") {
                if let val = Int(repsText) {
                    editReps = max(1, val)
                }
            }
            Button("Annuler", role: .cancel) {}
        }
        .alert("Modifier le set", isPresented: $showEditSetAlert) {
            TextField("Poids", text: $editSetWeight)
                .keyboardType(.decimalPad)
            TextField("Reps", text: $editSetReps)
                .keyboardType(.numberPad)
            Button("OK") {
                if let set = editingSet,
                   let w = Double(editSetWeight.replacingOccurrences(of: ",", with: ".")),
                   let r = Int(editSetReps) {
                    viewModel.editSet(set, weight: w, reps: max(1, r))
                }
                editingSet = nil
            }
            Button("Supprimer", role: .destructive) {
                if let set = editingSet {
                    withAnimation(.spring(response: 0.3)) {
                        viewModel.deleteSet(set, from: loggedExercise)
                    }
                }
                editingSet = nil
            }
            Button("Annuler", role: .cancel) { editingSet = nil }
        }
    }

    // MARK: - Header (with Valider button)

    private var cardHeader: some View {
        HStack(spacing: 8) {
            VStack(alignment: .leading, spacing: 3) {
                HStack(spacing: 6) {
                    Text(exercise?.name ?? "Unknown")
                        .font(.subheadline.weight(.semibold))
                        .lineLimit(1)

                    if loggedExercise.isLinkedToNext {
                        Image(systemName: "link")
                            .font(.caption2)
                            .foregroundStyle(Color.accentColor.opacity(0.7))
                    }
                }

                if let machineSetting = exercise?.machineSetting, !machineSetting.isEmpty {
                    Text(machineSetting.uppercased())
                        .font(.system(size: 9, weight: .bold, design: .rounded))
                        .foregroundStyle(.secondary)
                }
            }

            Spacer(minLength: 4)

            validerButton
                .frame(minWidth: 104)
        }
    }

    // MARK: - Sets List

    private var setsSection: some View {
        VStack(spacing: 0) {
            ForEach(loggedExercise.orderedSets) { set in
                CompactSetRow(
                    set: set,
                    isRecord: viewModel.justHitRecord[set.id] != nil
                ) {
                    editingSet = set
                    editSetWeight = set.weight > 0 ? set.weight.cleanWeight : "0"
                    editSetReps = "\(set.reps)"
                    showEditSetAlert = true
                }
            }
        }
    }

    // MARK: - Inline Edit Section (steppers only, no Valider)

    private var inlineEditSection: some View {
        VStack(spacing: 10) {
            HStack(alignment: .center, spacing: 7) {
                if exercise?.setPatternMode != .bodyweight {
                    weightStepper
                        .frame(maxWidth: .infinity, alignment: .leading)
                }

                repsStepper
                    .frame(maxWidth: .infinity, alignment: .leading)
            }

            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 6) {
                    if let lastSet = loggedExercise.lastCompletedSet {
                        Button {
                            editWeight = lastSet.weight
                            editReps = lastSet.reps
                            HapticManager.selection()
                        } label: {
                            HStack(spacing: 3) {
                                Image(systemName: "arrow.counterclockwise")
                                    .font(.system(size: 9))
                                Text(lastSet.weight > 0 ? "\(lastSet.weight.cleanWeight)×\(lastSet.reps)" : "BW×\(lastSet.reps)")
                                    .font(.caption2.weight(.semibold).monospacedDigit())
                            }
                            .foregroundStyle(.primary)
                            .padding(.horizontal, 8)
                            .padding(.vertical, 3)
                            .background(Color.white.opacity(0.08), in: Capsule())
                        }
                        .buttonStyle(.plain)
                    }

                    Button {
                        refreshSuggestion()
                        editWeight = cachedSuggestion.weight
                        editReps = cachedSuggestion.reps
                        HapticManager.selection()
                    } label: {
                        HStack(spacing: 3) {
                            Image(systemName: "sparkles")
                                .font(.system(size: 9))
                            Text("Suggéré")
                                .font(.caption2.weight(.medium))
                        }
                        .foregroundStyle(.secondary)
                        .padding(.horizontal, 8)
                        .padding(.vertical, 3)
                        .background(Color.white.opacity(0.08), in: Capsule())
                    }
                    .buttonStyle(.plain)
                }
            }
            .frame(height: 24)
        }
    }

    // MARK: - Stepper subviews

    private var weightStepper: some View {
        HStack(spacing: 4) {
            stepperButton(systemImage: "minus") {
                editWeight = max(0, editWeight - (exercise?.smallestIncrement ?? 2.5))
                HapticManager.tap()
            }

            Button {
                weightText = editWeight > 0 ? editWeight.cleanWeight : ""
                showWeightEntry = true
            } label: {
                Text(editWeight > 0 ? editWeight.cleanWeight : "BW")
                    .font(.callout.weight(.bold).monospacedDigit())
                    .lineLimit(1)
                    .frame(minWidth: 48)
                    .padding(.vertical, 6)
                    .padding(.horizontal, 6)
                    .background(Color.accentColor.opacity(0.14), in: RoundedRectangle(cornerRadius: 10))
            }
            .buttonStyle(.plain)

            stepperButton(systemImage: "plus") {
                editWeight += exercise?.smallestIncrement ?? 2.5
                HapticManager.tap()
            }
        }
    }

    private var repsStepper: some View {
        HStack(spacing: 4) {
            stepperButton(systemImage: "minus") {
                editReps = max(1, editReps - 1)
                HapticManager.tap()
            }

            Button {
                repsText = "\(editReps)"
                showRepsEntry = true
            } label: {
                Text("\(editReps)")
                    .font(.callout.weight(.bold).monospacedDigit())
                    .frame(minWidth: 34)
                    .padding(.vertical, 6)
                    .padding(.horizontal, 6)
                    .background(Color.accentColor.opacity(0.14), in: RoundedRectangle(cornerRadius: 10))
            }
            .buttonStyle(.plain)

            stepperButton(systemImage: "plus") {
                editReps += 1
                HapticManager.tap()
            }
        }
    }

    private func stepperButton(systemImage: String, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Image(systemName: systemImage)
                .font(.system(size: 11, weight: .bold))
                .frame(width: 30, height: 30)
                .background(Color.white.opacity(0.10), in: Circle())
        }
        .buttonStyle(.plain)
    }

    private var validerButton: some View {
        Button {
            withAnimation(.spring(response: 0.3)) {
                viewModel.logSet(
                    for: loggedExercise,
                    weight: editWeight,
                    reps: editReps,
                    setType: cachedSuggestion.setType
                )
            }
        } label: {
                Text("Valider")
                    .font(.caption.weight(.heavy))
                    .foregroundStyle(.white)
                    .lineLimit(1)
                    .padding(.horizontal, 13)
                    .padding(.vertical, 8)
                    .background(Color.accentColor, in: RoundedRectangle(cornerRadius: 14, style: .continuous))
        }
        .buttonStyle(.plain)
    }
}

// MARK: - Compact Set Row

struct CompactSetRow: View {
    let set: LoggedSet
    var isRecord: Bool = false
    var onTap: () -> Void = {}
    @State private var highlight = false
    @State private var starScale: CGFloat = 0.7

    var body: some View {
        Button(action: onTap) {
            HStack(spacing: 8) {
                setTypeLabel
                    .frame(width: 12, alignment: .center)

                if set.weight > 0 {
                    Text(set.weight.cleanWeight)
                        .font(.caption.weight(.bold).monospacedDigit())
                    Text("×")
                        .font(.system(size: 9))
                        .foregroundStyle(.tertiary)
                    Text("\(set.reps)")
                        .font(.caption.weight(.bold).monospacedDigit())
                } else {
                    Text("BW")
                        .font(.caption2.weight(.semibold))
                        .foregroundStyle(.secondary)
                    Text("×")
                        .font(.system(size: 9))
                        .foregroundStyle(.tertiary)
                    Text("\(set.reps)")
                        .font(.caption.weight(.bold).monospacedDigit())
                }

                if isRecord {
                    Image(systemName: "star.fill")
                        .font(.system(size: 9))
                        .foregroundStyle(.yellow)
                        .scaleEffect(starScale)
                        .shadow(color: .yellow.opacity(0.35), radius: 8)
                }

                Spacer()
            }
            .padding(.horizontal, 14)
            .padding(.vertical, 6)
            .background(
                RoundedRectangle(cornerRadius: 14, style: .continuous)
                    .fill(highlight ? .yellow.opacity(0.10) : .clear)
            )
            .overlay {
                if isRecord {
                    RoundedRectangle(cornerRadius: 14, style: .continuous)
                        .stroke(.yellow.opacity(highlight ? 0.45 : 0.18), lineWidth: 1)
                }
            }
        }
        .buttonStyle(.plain)
        .onAppear {
            guard isRecord else { return }
            withAnimation(.spring(response: 0.42, dampingFraction: 0.55)) {
                highlight = true
                starScale = 1.18
            }
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.55) {
                withAnimation(.easeOut(duration: 0.28)) {
                    starScale = 1.0
                }
            }
        }
    }

    @ViewBuilder
    private var setTypeLabel: some View {
        switch set.setType {
        case .topSet:
            Text("T")
                .font(.system(size: 9).weight(.bold))
                .foregroundStyle(.orange)
        case .backoff:
            Text("B")
                .font(.system(size: 9).weight(.bold))
                .foregroundStyle(.blue)
        case .warmup:
            Text("W")
                .font(.system(size: 9).weight(.bold))
                .foregroundStyle(.yellow)
        case .work:
            Circle()
                .fill(Color.accentColor.opacity(0.5))
                .frame(width: 4, height: 4)
        }
    }
}
