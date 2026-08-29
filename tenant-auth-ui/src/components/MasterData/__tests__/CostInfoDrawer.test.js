import React from 'react';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import CostInfoDrawer from '../CostInfoDrawer';
import costInfoService from '../../../services/costInfoService';

jest.mock('../../../services/costInfoService', () => {
  const groupName = (g) => (g && (g.Name ?? g.name)) || '';
  const groupId = (g) => (g && (g.id ?? g.Id)) || null;
  const typeName = (t) => (t && (t.Name ?? t.name)) || '';
  const typeId = (t) => (t && (t.id ?? t.Id)) || null;
  return {
    __esModule: true,
    groupName, groupId, typeName, typeId,
    default: {
      getTaxGroups: jest.fn(), createTaxGroup: jest.fn(), createCostInfo: jest.fn(), getTaxGroupRate: jest.fn(),
      getCostInfo: jest.fn(), updateCostInfo: jest.fn(),
      getTaxTypes: jest.fn(), getMappers: jest.fn(), createTaxType: jest.fn(), createMapper: jest.fn(), deleteMapper: jest.fn(),
      idOf: (r) => (r && (r.id ?? r.Id)) || null,
      groupName, groupId, typeName, typeId,
    },
  };
});
jest.mock('react-toastify', () => ({ toast: { success: jest.fn(), error: jest.fn(), warn: jest.fn() } }));

const GROUPS = [{ Id: 'g1', Name: 'GST 18%' }, { Id: 'g2', Name: 'GST 5%' }];
const RATE = {
  effectiveRate: 18,
  components: [{ id: 'tt1', name: 'CGST', rate: 9 }, { id: 'tt2', name: 'SGST', rate: 9 }],
};

beforeEach(() => {
  costInfoService.getTaxGroups.mockResolvedValue(GROUPS);
  costInfoService.getTaxTypes.mockResolvedValue([]);
  costInfoService.getMappers.mockResolvedValue([]);
  costInfoService.getTaxGroupRate.mockResolvedValue(RATE);
  costInfoService.createTaxGroup.mockImplementation(async (name) => ({ Id: 'g9', Name: name }));
  costInfoService.createTaxType.mockResolvedValue({ Id: 'tt9', Name: 'IGST', Value: 18 });
  costInfoService.createMapper.mockResolvedValue({ Id: 'm9' });
  costInfoService.deleteMapper.mockResolvedValue({});
  costInfoService.createCostInfo.mockResolvedValue({ Id: 'ci-1' });
  costInfoService.updateCostInfo.mockResolvedValue({ Id: 'ci-9' });
});
afterEach(() => jest.clearAllMocks());

const renderDrawer = (props = {}) => {
  const onSaved = jest.fn();
  render(<CostInfoDrawer open onClose={() => {}} onSaved={onSaved} {...props} />);
  return onSaved;
};
const combo = () => screen.getByLabelText('Tax group');
const openCombo = () => fireEvent.focus(combo());
const selectGST18 = async () => {
  await waitFor(() => expect(costInfoService.getTaxGroups).toHaveBeenCalled());
  openCombo();
  fireEvent.click(screen.getByText('GST 18%'));
  await waitFor(() => expect(costInfoService.getTaxGroupRate).toHaveBeenCalledWith('g1'));
};

// ── ① Tax Group ──────────────────────────────────────────────────────────────
test('lists existing tax groups and shows the live rate on select', async () => {
  renderDrawer();
  await selectGST18();
  expect(await screen.findByText(/Effective tax 18%/)).toBeInTheDocument();
  expect(screen.getByText(/CGST 9% \+ SGST 9%/)).toBeInTheDocument();
});

test('creates a tax group inline and selects it', async () => {
  renderDrawer();
  await waitFor(() => expect(costInfoService.getTaxGroups).toHaveBeenCalled());
  openCombo();
  fireEvent.change(combo(), { target: { value: 'GST 28%' } });
  fireEvent.click(screen.getByText(/Create/));
  await waitFor(() => expect(costInfoService.createTaxGroup).toHaveBeenCalledWith('GST 28%'));
  expect(await screen.findByText('GST 28%')).toBeInTheDocument();
});

// ── ② Group Map ──────────────────────────────────────────────────────────────
test('shows the group’s tax types as chips', async () => {
  renderDrawer();
  await selectGST18();
  const map = screen.getByText('Group Map — tax types').closest('section');
  // The chips come from getMappers, a different request than the rate that
  // selectGST18 waits on, so they have to be awaited in their own right — a
  // synchronous getByText here just races the fetch and loses under load.
  expect(await within(map).findByText('CGST')).toBeInTheDocument();
  expect(await within(map).findByText('SGST')).toBeInTheDocument();
});

test('removing a chip deletes that mapper', async () => {
  costInfoService.getMappers.mockResolvedValue([{ Id: 'm1', TaxGroupId: 'g1', TaxTypeId: 'tt1' }]);
  renderDrawer();
  await selectGST18();
  await waitFor(() => expect(screen.getByLabelText('Remove CGST')).toBeInTheDocument());

  fireEvent.click(screen.getByLabelText('Remove CGST'));
  await waitFor(() => expect(costInfoService.deleteMapper).toHaveBeenCalledWith('m1'));
});

// ── ③ Tax Detail ─────────────────────────────────────────────────────────────
test('adds a new tax type inline (creates the type + maps it to the group)', async () => {
  renderDrawer();
  await selectGST18();

  fireEvent.click(screen.getByText('＋ Add tax type'));
  fireEvent.change(screen.getByLabelText('Tax type name'), { target: { value: 'IGST' } });
  fireEvent.change(screen.getByLabelText('Rate'), { target: { value: '18' } });
  fireEvent.click(screen.getByRole('button', { name: /^Add$/ }));

  await waitFor(() => expect(costInfoService.createTaxType).toHaveBeenCalledWith({ name: 'IGST', value: '18' }));
  await waitFor(() => expect(costInfoService.createMapper).toHaveBeenCalledWith({ taxGroupId: 'g1', taxTypeId: 'tt9' }));
});

// ── Edit an existing Cost Info (opened with a costInfoId) ────────────────────
test('repopulates an existing cost info and updates it', async () => {
  costInfoService.getCostInfo.mockResolvedValue({ Id: 'ci-9', Amount: 250, TaxGroupId: 'g1', IsTaxIncluded: 1 });
  const onSaved = renderDrawer({ costInfoId: 'ci-9' });

  // Loaded the record and prefilled amount + group (which pulls its rate).
  await waitFor(() => expect(costInfoService.getCostInfo).toHaveBeenCalledWith('ci-9'));
  expect(await screen.findByText('Edit Cost Info')).toBeInTheDocument();
  await waitFor(() => expect(screen.getByLabelText('Amount')).toHaveValue(250));
  await waitFor(() => expect(costInfoService.getTaxGroupRate).toHaveBeenCalledWith('g1'));
  expect(screen.getByText('GST 18%')).toBeInTheDocument(); // selected group chip

  // Save updates (not creates) the same record.
  fireEvent.click(screen.getByRole('button', { name: /Update Cost Info/ }));
  await waitFor(() => expect(costInfoService.updateCostInfo).toHaveBeenCalledWith('ci-9', {
    amount: '250', taxGroupId: 'g1', isTaxIncluded: true,
  }));
  await waitFor(() => expect(costInfoService.createCostInfo).not.toHaveBeenCalled());
  await waitFor(() => expect(onSaved).toHaveBeenCalledWith('ci-9', expect.any(Object)));
});

// ── Save (create) ────────────────────────────────────────────────────────────
test('saves the cost info and returns its id', async () => {
  const onSaved = renderDrawer();
  fireEvent.change(screen.getByLabelText('Amount'), { target: { value: '250' } });
  await selectGST18();
  fireEvent.click(await screen.findByRole('button', { name: /Save Cost Info/ }));

  await waitFor(() => expect(costInfoService.createCostInfo).toHaveBeenCalledWith({
    amount: '250', taxGroupId: 'g1', isTaxIncluded: false,
  }));
  await waitFor(() => expect(onSaved).toHaveBeenCalledWith('ci-1', expect.any(Object)));
});

// ── A tax-free product ───────────────────────────────────────────────────────
// A tax group with NO tax types mapped into it IS the exemption — the pricing
// chain already treats it as a valid 0%. What used to be wrong was only the
// wording: "no tax types on this group YET" reads as setup somebody abandoned
// rather than a decision they made.
describe('an exempt (0%) tax group', () => {
  const EXEMPT = { Id: 'g-exempt', Name: 'Exempt (0%)' };

  const selectExempt = async () => {
    costInfoService.getTaxGroups.mockResolvedValue([...GROUPS, EXEMPT]);
    // No components, and therefore no rate.
    costInfoService.getTaxGroupRate.mockResolvedValue({ effectiveRate: 0, components: [] });
    const onSaved = renderDrawer();
    await waitFor(() => expect(costInfoService.getTaxGroups).toHaveBeenCalled());
    openCombo();
    fireEvent.click(screen.getByText('Exempt (0%)'));
    await waitFor(() => expect(costInfoService.getTaxGroupRate).toHaveBeenCalledWith('g-exempt'));
    return onSaved;
  };

  test('reads as a decision, not as unfinished setup', async () => {
    await selectExempt();
    // Scoped to the footer: the step-2 note says "exempt" too, which is the
    // point — both halves agree.
    const rate = await screen.findByText(/Effective tax 0%/);
    expect(rate.closest('.ci-rate-exempt')).toHaveTextContent('exempt');
    // The word that made it read as abandoned setup.
    expect(screen.queryByText(/on this group yet/i)).toBeNull();
  });

  test('says the empty group is valid rather than incomplete', async () => {
    await selectExempt();
    const note = await screen.findByText(/this group charges/i);
    expect(note).toHaveTextContent(/valid, exempt group/i);
    // …while still offering the way to make it a taxed group.
    expect(note).toHaveTextContent(/only if it should be taxed/i);
  });

  // The whole point: this was already allowed, and the button was already
  // enabled. Nothing about saving needed to change.
  test('saves like any other group', async () => {
    const onSaved = await selectExempt();
    fireEvent.change(screen.getByLabelText(/Amount/i), { target: { value: '40' } });

    const save = screen.getByRole('button', { name: /Save Cost Info/i });
    expect(save).toBeEnabled();
    fireEvent.click(save);

    await waitFor(() => expect(costInfoService.createCostInfo).toHaveBeenCalled());
    const [payload] = costInfoService.createCostInfo.mock.calls[0];
    // A real group id, not a null — which is what keeps an exempt sale
    // identifiable on a GST return.
    expect(payload.taxGroupId).toBe('g-exempt');
  });

  // A taxed group must not start reading as exempt.
  test('a group with components still shows its rate', async () => {
    renderDrawer();
    await selectGST18();
    expect(await screen.findByText(/Effective tax 18%/)).toBeInTheDocument();
    expect(screen.queryByText(/— exempt/)).toBeNull();
  });
});
