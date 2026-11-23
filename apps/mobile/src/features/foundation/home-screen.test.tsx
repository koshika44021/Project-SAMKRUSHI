import { render, screen } from '@testing-library/react-native';
import { HomeScreen } from './home-screen';

describe('HomeScreen', () => {
  it('renders the app title as a header', async () => {
    await render(<HomeScreen />);
    expect(screen.getByRole('header')).toHaveTextContent('SAMKRUSHI');
  });

  it('shows the formatted business date', async () => {
    await render(<HomeScreen />);
    expect(screen.getByTestId('business-date')).toHaveTextContent(
      /^(Sun|Mon|Tue|Wed|Thu|Fri|Sat), \d{1,2} [A-Z][a-z]{2} \d{4}$/,
    );
  });
});
