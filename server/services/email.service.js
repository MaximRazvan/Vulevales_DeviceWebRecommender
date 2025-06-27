const nodemailer = require('nodemailer');

// 1. Configurarea "transporter"-ului este acum responsabilitatea acestui serviciu.
const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: process.env.EMAIL_USER || 'razvanmaxim3@gmail.com',
        pass: process.env.EMAIL_PASS || 'pquq zost lruw aoly'
    }
});

/**
 * Trimite un email de bun venit unui utilizator nou inregistrat.
 * @param {object} user - Obiectul utilizatorului (trebuie sa contina `email` si `username`).
 */
async function sendRegistrationEmail(user) {
    if (!user || !user.email || !user.username) {
        console.error('Email de inregistrare nu a putut fi trimis: date utilizator incomplete.');
        return;
    }

    const mailOptions = {
        from: process.env.EMAIL_USER || 'razvanmaxim3@gmail.com',
        to: user.email,
        subject: 'Contul tau a fost creat cu succes!',
        html: `
            <p>Salut, ${user.username}!</p>
            <p>Contul tau a fost creat cu succes pe platforma de Recomandări Dispozitive Electronice.</p>
            <p>Te poti conecta acum si poti incepe sa explorezi produsele noastre.</p>
            <p>Cu respect,<br>Echipa noastra</p>
        `
    };

    try {
        await transporter.sendMail(mailOptions);
        console.log(`Email de confirmare trimis cu succes la ${user.email}`);
    } catch (error) {
        console.error(`Eroare la trimiterea email-ului de confirmare catre ${user.email}:`, error);
        // Nu blocam procesul de inregistrare daca email-ul esueaza, doar inregistram eroarea.
    }
}

// Exportam functia specifica, nu intregul transporter.
// Astfel, restul aplicatiei nu trebuie sa stie detalii despre nodemailer.
module.exports = {
    sendRegistrationEmail
};