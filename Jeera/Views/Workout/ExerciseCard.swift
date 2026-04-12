import SwiftUI
import SwiftData

struct ExerciseCard: View {
    @Bindable var loggedExercise: LoggedExercise
    @Bindable var viewModel: WorkoutViewModel

    @State private var isExpanded = true
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
                        .padding(.horizontal, 18)
                        .padding(.top, 14)
                        .padding(.bottom, isExpanded ? 10 : 14)
                        .contentShape(Rectangle())
                        .onTapGesture {
                            withAnimation(.spring(response: 0.3, dampingFraction: 0.85)) {
                                isExpanded.toggle()
                                HapticManager.tap()
                            }
                        }

                    if isExpanded {
                        Divider().background(.white.opacity(0.06))

                        if !loggedExercise.orderedSets.isEmpty {
                            setsSection
                        }

                        inlineEditSection
                            .padding(.horizontal, 16)
                            .padding(.vertical, 12)
                    }
                }
                .frame(maxWidth: .infinity)
            }
            .overlay {
                // Armed-for-superset highlight ring.
                if isArmed {
                    RoundedRectangle(cornerRadius: 26, style: .continuous)
                        .stroke(Color.accentColor.opacity(0.7), lineWidth: 1.5)
                        .transition(.opacity)
                }
            }
            .animation(.easeInOut(duration: 0.2), value: isArmed)
            // Trailing swipe = delete exercise only.
            .swipeActions(edge: .trailing, allowsFullSwipe: false) {
                Button(role: .destructive) {
                    withAnimation { viewModel.removeExercise(loggedExercise) }
                } label: {
                    Label("Supprimer", systemImage: "trash")
                }
            }
            // Leading swipe = superset link / unlink.
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

    // MARK: - Header

    private var cardHeader: some View {
        HStack(spacing: 10) {
            VStack(alignment: .leading, spacing: 4) {
                HStack(spacing: 6) {
                    Text(exercise?.name ?? "Unknown")
                        .font(.callout.weight(.semibold))
                        .lineLimit(1)
                    if loggedExercise.isLinkedToNext {
                        Image(systemName: "link")
                            .font(.caption2)
                            .foregroundStyle(Color.accentColor.opacity(0.7))
                    }
                }

                HStack(spacing: 8) {
                    if let ex = exercise {
                        Text(ex.setPatternMode.shortName)
                            .font(.caption2)
                            .foregroundStyle(.tertiary)
                        Text(ex.repTargetDisplay + "r")
                            .font(.caption2)
                            .foregroundStyle(.secondary)
                        if !ex.machineSetting.isEmpty {
                            Text(ex.machineSetting)
                                .font(.caption2.weight(.semibold))
                                .foregroundStyle(.orange)
                                .padding(.horizontal, 6)
                                .padding(.vertical, 1)
                                .background(Color.orange.opacity(0.12), in: Capsule())
                        }
                    }
                }
            }

            Spacer()

            if !loggedExercise.completedWorkSets.isEmpty {
                Text("\(loggedExercise.completedWorkSets.count)")
                    .font(.callout.weight(.bold).monospacedDigit())
                    .foregroundStyle(Color.accentColor)
                    .frame(width: 28, height: 28)
                    .background(Color.accentColor.opacity(0.12), in: Circle())
            }

            Image(systemName: isExpanded ? "chevron.up" : "chevron.down")
                .font(.caption2)
                .foregroundStyle(.tertiary)
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

    // MARK: - Inline Edit Section

    private var inlineEditSection: some View {
        VStack(spacing: 12) {
            HStack(spacing: 10) {
                if exercise?.setPatternMode != .bodyweight {
                    weightStepper
                    Text("×")
                        .font(.caption)
                        .foregroundStyle(.tertiary)
                }

                repsStepper

                Spacer()

                validerButton
            }

            // Combined quick actions + muscle impact strip.
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 8) {
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
                            .padding(.horizontal, 10)
                            .padding(.vertical, 5)
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
                        .padding(.horizontal, 10)
                        .padding(.vertical, 5)
                        .background(Color.white.opacity(0.08), in: Capsule())
                    }
                    .buttonStyle(.plain)

                    if !loggedExercise.completedWorkSets.isEmpty, let ex = exercise {
                        let impact = EffectiveSetsEngine.liveParentImpact(exercise: ex, completedSets: loggedExercise.completedWorkSets.count)
                        let sorted = impact.sorted(by: { $0.value > $1.value })
                        ForEach(sorted, id: \.key) { parent, sets in
                            HStack(spacing: 3) {
                                Text(parent.shortName)
                                    .font(.caption2.weight(.medium))
                                Text("+\(sets, specifier: "%.1f")")
                                    .font(.caption2.weight(.bold).monospacedDigit())
                                    .foregroundStyle(sets >= 1 ? Color.accentColor : .secondary)
                            }
                            .padding(.horizontal, 10)
                            .padding(.vertical, 5)
                            .background(Color.white.opacity(0.06), in: Capsule())
                        }
                    }
                }
            }
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
                    .font(.title3.weight(.bold).monospacedDigit())
                    .lineLimit(1)
                    .fixedSize(horizontal: true, vertical: false)
                    .frame(minWidth: 58)
                    .padding(.vertical, 4)
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
                    .font(.title3.weight(.bold).monospacedDigit())
                    .frame(minWidth: 34)
                    .padding(.vertical, 4)
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
                .font(.footnote.weight(.heavy))
                .foregroundStyle(.white)
                .lineLimit(1)
                .minimumScaleFactor(0.8)
                .fixedSize(horizontal: true, vertical: false)
                .padding(.horizontal, 18)
                .padding(.vertical, 9)
                .background(Color.accentColor, in: Capsule())
        }
        .buttonStyle(.plain)
    }
}

// MARK: - Compact Set Row

struct CompactSetRow: View {
    let set: LoggedSet
    var isRecord: Bool = false
    var onTap: () -> Void = {}

    var body: some View {
        Button(action: onTap) {
            HStack(spacing: 8) {
                setTypeLabel
                    .frame(width: 18, alignment: .center)

                Text("#\(set.setSlotIndex + 1)")
                    .font(.caption2.weight(.medium).monospacedDigit())
                    .foregroundStyle(.tertiary)
                    .frame(width: 18, alignment: .leading)

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
                }

                Spacer()

                Image(systemName: "checkmark")
                    .font(.system(size: 9).weight(.bold))
                    .foregroundStyle(.green.opacity(0.7))
            }
            .padding(.horizontal, 18)
            .padding(.vertical, 7)
        }
        .buttonStyle(.plain)
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
