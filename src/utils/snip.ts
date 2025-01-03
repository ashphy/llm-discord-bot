const THRETSHOLD = 100;

export const snip = (text: string): string => {
	if (text.length > THRETSHOLD) {
		return `${text.slice(0, THRETSHOLD)}…`;
	}
	return text;
};
